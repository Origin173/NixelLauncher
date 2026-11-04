import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { link, lstat, mkdir, rename, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Context } from 'cordis';
import { serviceEnvironment } from '../host/service-environment';
import type {
  ContentCategory,
  Instance,
  ResourceQuery,
  ResourceSearchResult,
} from '../shared/contracts';
import type { TaskContext } from '../shared/host-api';
import { tr } from '../shared/i18n';
import { commandsFor } from './commands';
import { registerContentUpdates } from './content-updates';
import { download, hashFile, inside } from './files';
import { assertInstanceIdle, getInstance } from './game';
import { importModpack } from './modpacks';
import { ModrinthClient, type ProjectVersion } from './modrinth-client';
import type { ResourceProvider } from './providers';
import {
  assertRequiredContentEnabled,
  contentDirectories,
  installContentFile,
  normalizeResourceSource,
  scanContent,
} from './resource-files';

export const resourcesId = 'nixel.resources.modrinth';
const categories: Record<string, ContentCategory | 'modpacks'> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaders',
  modpack: 'modpacks',
};
const projectTypes: Record<string, string> = {
  mods: 'mod',
  resourcepacks: 'resourcepack',
  shaders: 'shader',
  modpacks: 'modpack',
};
const compatible = (version: ProjectVersion, instance: Instance) =>
  version.game_versions.includes(instance.version) &&
  (version.loaders.some((loader) => ['minecraft', 'iris', 'optifine'].includes(loader)) ||
    version.loaders.includes(instance.loader.toLowerCase()));
const versionOptions = (instance?: Instance) =>
  instance
    ? {
        gameVersions: [instance.version],
        loaders:
          instance.loader === 'Vanilla'
            ? ['minecraft', 'iris', 'optifine']
            : [instance.loader.toLowerCase(), 'minecraft', 'iris', 'optifine'],
      }
    : {};

export const resourcesPlugin = {
  name: resourcesId,
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    const client = new ModrinthClient({
      'User-Agent': 'NixelLauncher/0.1.0',
      ...(serviceEnvironment.modrinthToken
        ? { Authorization: serviceEnvironment.modrinthToken }
        : {}),
    });
    const provider: ResourceProvider = {
      async search(query: ResourceQuery, instance?: Instance) {
        const facets: string[][] = [];
        const projectType = projectTypes[query.category];
        if (projectType) facets.push([`project_type:${projectType}`]);
        if (instance) {
          facets.push([`versions:${instance.version}`]);
          if (projectType === 'mod') facets.push([`categories:${instance.loader.toLowerCase()}`]);
        }
        const result = await client.searchProjects({
          query: query.query,
          facets: JSON.stringify(facets),
          index: ['relevance', 'downloads', 'follows', 'newest', 'updated'].includes(
            query.sort || '',
          )
            ? query.sort
            : 'relevance',
          limit: 20,
          offset: query.offset || 0,
        });
        return {
          total: result.total_hits,
          items: result.hits.map((hit) => ({
            id: hit.project_id,
            name: hit.title,
            author: hit.author,
            desc: hit.description,
            category: categories[hit.project_type] || 'mods',
            source: resourcesId,
            downloads: hit.downloads.toLocaleString(),
            version: hit.latest_version,
            color: 'green',
            icon: hit.icon_url ?? undefined,
            url: `https://modrinth.com/${hit.project_type}/${hit.slug}`,
          })),
        };
      },
      async versions(projectId, instance) {
        return (await client.getProjectVersions(projectId, versionOptions(instance))).map(
          (version) => ({
            id: version.id,
            name: version.name,
            version: version.version_number,
            gameVersions: version.game_versions,
            loaders: version.loaders,
            publishedAt: version.date_published,
          }),
        );
      },
      async install(projectId, versionId, instance, task) {
        const visited = new Set<string>();
        const resolvedProjects = new Map<string, string>();
        async function installVersion(projectId: string, versionId: string, required = false) {
          task.signal.throwIfAborted();
          if (required && instance)
            assertRequiredContentEnabled(host, instance, resourcesId, projectId);
          const selected = resolvedProjects.get(projectId);
          if (selected && selected !== versionId)
            throw new Error(
              tr('resources.modrinthDependencyConflictProjectValueRequiresBoth', {
                value1: projectId,
                value2: selected,
                value3: versionId,
              }),
            );
          resolvedProjects.set(projectId, versionId);
          if (visited.has(versionId)) return;
          visited.add(versionId);
          const version = await client.getProjectVersion(versionId, task.signal);
          if (version.project_id !== projectId)
            throw new Error(tr('resources.theResourceAndVersionDoNotMatch'));
          const project = await client.getProject(projectId, task.signal);
          const category = categories[project.project_type];
          const file = version.files.find((entry) => entry.primary) || version.files[0];
          if (!file) throw new Error(tr('resources.thisResourceVersionHasNoDownloadableFile'));
          if (category === 'modpacks') {
            const path = inside(host.store.cacheRoot, `${randomUUID()}.mrpack`);
            await download(file.url, path, task.signal, file.hashes, (current, total) =>
              task.report(
                total ? (current / total) * 100 : 0,
                tr('curseforge.downloadValue', { value1: project.title }),
              ),
            );
            await importModpack(host, path, task, project.title);
            return;
          }
          if (!instance) throw new Error(tr('curseforge.chooseATargetInstanceFirst'));
          const targetInstance = instance;
          if (!compatible(version, targetInstance))
            throw new Error(
              tr('resources.versionValueIsIncompatibleWithThisInstance', {
                value1: version.version_number,
              }),
            );
          for (const dependency of version.dependencies.filter(
            (entry) => entry.dependency_type === 'required',
          )) {
            const required = dependency.version_id
              ? await client.getProjectVersion(dependency.version_id, task.signal)
              : dependency.project_id
                ? (
                    await client.getProjectVersions(
                      dependency.project_id,
                      versionOptions(instance),
                      task.signal,
                    )
                  )[0]
                : undefined;
            if (!required)
              throw new Error(
                tr('resources.cannotResolveRequiredDependencyValue', {
                  value1: dependency.project_id || tr('resources.unknownDependency'),
                }),
              );
            await installVersion(required.project_id, required.id, true);
          }
          if (!category) throw new Error(tr('resources.unsupportedResourceType'));
          await installContentFile(host, targetInstance, task, {
            source: resourcesId,
            projectId,
            versionId,
            name: project.title,
            icon: project.icon_url ?? undefined,
            version: version.version_number,
            category,
            fileName: file.filename,
            url: file.url,
            hashes: file.hashes,
          });
        }
        await installVersion(projectId, versionId);
      },
      async checkUpdates(instance, task) {
        const entries = host.store
          .read()
          .content.filter(
            (entry) =>
              entry.instance === instance.id &&
              (!entry.source || normalizeResourceSource(entry.source) === resourcesId),
          );
        const errors: Error[] = [];
        for (const [index, entry] of entries.entries()) {
          task.signal.throwIfAborted();
          task.report(
            (index / entries.length) * 100,
            tr('content.checkingFile', { name: entry.name }),
          );
          try {
            const path = inside(
              join(instance.directory, contentDirectories[entry.category]),
              entry.fileName,
            );
            const hash = await hashFile(path, 'sha512', task.signal);
            const versions = await client.getLatestVersionsFromHashes(
              [hash],
              {
                algorithm: 'sha512',
                ...versionOptions(instance),
              },
              task.signal,
            );
            const latest = versions[hash];
            if (!latest) continue;
            const current = await client.getProjectVersionByHash(
              hash,
              { algorithm: 'sha512' },
              task.signal,
            );
            if (entry.projectId && entry.projectId !== current.project_id)
              throw new Error(tr('content.fileIdentityChanged', { name: entry.name }));
            const project =
              !entry.projectId || !entry.icon
                ? await client.getProject(current.project_id, task.signal)
                : undefined;
            await host.store.update((draft) => {
              const item = draft.content.find((content) => content.id === entry.id);
              if (item) {
                item.projectId = current.project_id;
                item.versionId = current.id;
                item.version = current.version_number;
                item.source = resourcesId;
                if (project) {
                  item.name = project.title;
                  item.icon = project.icon_url ?? undefined;
                }
                item.update =
                  current.id !== latest.id &&
                  Date.parse(latest.date_published) > Date.parse(current.date_published)
                    ? { versionId: latest.id, version: latest.version_number }
                    : undefined;
              }
            });
          } catch (error) {
            task.signal.throwIfAborted();
            const failure = new Error(
              tr('content.fileCheckFailed', {
                name: entry.name,
                message: error instanceof Error ? error.message : String(error),
              }),
            );
            errors.push(failure);
            task.log(failure.message);
          }
        }
        task.report(100);
        if (errors.length) throw new AggregateError(errors, tr('content.checkIncomplete'));
      },
    };
    host.providers.register(
      ctx,
      {
        id: resourcesId,
        pluginId: resourcesId,
        kind: 'resources',
        name: 'Modrinth',
        capabilities: ['mods', 'resourcepacks', 'shaders', 'modpacks'],
      },
      provider,
    );
  },
};

export const contentPlugin = {
  name: 'nixel.resources',
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    const command = commandsFor(ctx);
    registerContentUpdates(ctx);
    const selected = (instanceId?: string, source?: string) => {
      const instance = instanceId ? getInstance(host, instanceId) : undefined;
      const id =
        normalizeResourceSource(source) ||
        instance?.providers.resources ||
        host.store.read().settings.providers.resources;
      return { id, instance, provider: host.providers.get<ResourceProvider>('resources', id) };
    };
    command('resources.search', async (query: ResourceQuery): Promise<ResourceSearchResult> => {
      const instance = query.instanceId ? getInstance(host, query.instanceId) : undefined;
      const source = normalizeResourceSource(query.source);
      const sources = host.providers
        .list()
        .filter(
          (provider) =>
            provider.kind === 'resources' &&
            (!source || source === 'all' || provider.id === source),
        );
      const responses = await Promise.allSettled(
        sources.map((source) =>
          host.providers.get<ResourceProvider>('resources', source.id).search(query, instance),
        ),
      );
      const pages: ResourceSearchResult['items'][] = [];
      const warnings: ResourceSearchResult['warnings'] = [];
      let total = 0;
      let hasMore = false;
      responses.forEach((response, index) => {
        const source = sources[index];
        if (!source) return;
        if (response.status === 'rejected') {
          warnings.push({
            source: source.name,
            message:
              response.reason instanceof Error ? response.reason.message : String(response.reason),
          });
          return;
        }
        pages.push(response.value.items.map((item) => ({ ...item, source: source.id })));
        total += response.value.total;
        hasMore ||= (query.offset ?? 0) + 20 < response.value.total;
      });
      const items = Array.from({ length: 20 }, (_, index) =>
        pages.flatMap((page) => (page[index] ? [page[index]] : [])),
      ).flat();
      return { items, total, hasMore, warnings };
    });
    command(
      'resources.versions',
      ({
        projectId,
        instanceId,
        source,
      }: {
        projectId: string;
        instanceId?: string;
        source?: string;
      }) => {
        const selection = selected(instanceId, source);
        return selection.provider.versions(projectId, selection.instance);
      },
    );
    command(
      'resources.install',
      ({
        projectId,
        versionId,
        instanceId,
        source,
      }: {
        projectId: string;
        versionId: string;
        instanceId?: string;
        source?: string;
      }) => {
        const selection = selected(instanceId, source);
        const instance = selection.instance;
        if (instance) assertInstanceIdle(host, instance.id);
        return {
          taskId: host.tasks.start(
            tr('resources.installResource'),
            tr('resources.resolvingResourcesAndDependencies'),
            async (task: TaskContext) => {
              const current = selected(instanceId, selection.id);
              if (current.instance) assertInstanceIdle(host, current.instance.id, task.taskId);
              await current.provider.install(projectId, versionId, current.instance, task);
            },
            {
              instanceId: instance?.id,
              resourceId: projectId,
              resourceSource: selection.id,
              kind: 'resource',
              retry: {
                command: 'resources.install',
                params: { projectId, versionId, instanceId, source: selection.id },
              },
            },
          ),
        };
      },
    );
    command('content.list', ({ instanceId }: { instanceId: string }) => {
      const instance = getInstance(host, instanceId);
      return host.tasks
        .list()
        .some((task) => task.instanceId === instanceId && task.status === 'running')
        ? host.store.read().content.filter((entry) => entry.instance === instanceId)
        : scanContent(host, instance);
    });
    command(
      'content.import',
      ({
        instanceId,
        category,
        paths,
      }: {
        instanceId: string;
        category: ContentCategory;
        paths: string[];
      }) => {
        const instance = getInstance(host, instanceId);
        assertInstanceIdle(host, instanceId);
        if (!Object.hasOwn(contentDirectories, category) || !Array.isArray(paths) || !paths.length)
          throw new Error(tr('resources.chooseAContentTypeAndLocalFiles'));
        return {
          taskId: host.tasks.start(
            tr('resources.importLocalContent'),
            tr('resources.copyingLocalFiles'),
            async (task) => {
              assertInstanceIdle(host, instanceId, task.taskId);
              const directory = join(instance.directory, contentDirectories[category]);
              await mkdir(directory, { recursive: true });
              const imported: string[] = [];
              const staged: string[] = [];
              try {
                const names = new Set<string>();
                const files = [];
                for (const path of paths) {
                  const name = basename(path);
                  const extension = category === 'mods' ? /\.jar$/i : /\.zip$/i;
                  if (!extension.test(name) || !(await lstat(path)).isFile())
                    throw new Error(tr('resources.unsupportedLocalFileValue', { value1: name }));
                  const target = inside(directory, name);
                  if (
                    names.has(name.toLowerCase()) ||
                    (await lstat(target).then(
                      () => true,
                      () => false,
                    ))
                  )
                    throw new Error(
                      tr('resources.fileAlreadyExistsRemoveOrRenameIt', { value1: name }),
                    );
                  names.add(name.toLowerCase());
                  files.push({ path, target, name });
                }
                for (const [index, file] of files.entries()) {
                  task.signal.throwIfAborted();
                  const temporary = join(directory, `.nixel-${randomUUID()}.part`);
                  staged.push(temporary);
                  await pipeline(
                    createReadStream(file.path),
                    createWriteStream(temporary, { flags: 'wx' }),
                    { signal: task.signal },
                  );
                  // Creating the final hard link fails on collisions without replacing user files.
                  await link(temporary, file.target);
                  imported.push(file.target);
                  task.report(
                    ((index + 1) / files.length) * 100,
                    tr('resources.importValue', { value1: file.name }),
                  );
                }
                task.signal.throwIfAborted();
                await scanContent(host, instance);
                task.log(tr('resources.importedValueLocalFiles', { value1: files.length }));
              } catch (error) {
                await Promise.all(imported.map((path) => rm(path, { force: true })));
                throw error;
              } finally {
                await Promise.all(staged.map((path) => rm(path, { force: true })));
              }
            },
            {
              instanceId,
              kind: 'resource',
              retry: { command: 'content.import', params: { instanceId, category, paths } },
            },
          ),
        };
      },
    );
    command(
      'content.setEnabled',
      async ({ instanceId, id, enabled }: { instanceId: string; id: string; enabled: boolean }) => {
        const instance = getInstance(host, instanceId);
        assertInstanceIdle(host, instanceId);
        const entry = host.store
          .read()
          .content.find((entry) => entry.instance === instanceId && entry.id === id);
        if (!entry) throw new Error(tr('resources.fileNotFoundRefreshTheList'));
        if (entry.enabled === enabled) return;
        const fileName = enabled
          ? entry.fileName.replace(/\.disabled$/, '')
          : `${entry.fileName}.disabled`;
        const directory = join(instance.directory, contentDirectories[entry.category]);
        const target = inside(directory, fileName);
        if (
          await stat(target).then(
            () => true,
            () => false,
          )
        )
          throw new Error(tr('resources.targetFileAlreadyExists'));
        await rename(inside(directory, entry.fileName), target);
        await host.store.update((draft) => {
          const item = draft.content.find((entry) => entry.id === id);
          if (item) {
            item.enabled = enabled;
            item.fileName = fileName;
          }
        });
      },
    );
    command('content.remove', async ({ instanceId, id }: { instanceId: string; id: string }) => {
      const instance = getInstance(host, instanceId);
      assertInstanceIdle(host, instanceId);
      const entry = host.store
        .read()
        .content.find((entry) => entry.instance === instanceId && entry.id === id);
      if (!entry) throw new Error(tr('resources.fileNotFound'));
      await rm(
        inside(join(instance.directory, contentDirectories[entry.category]), entry.fileName),
        { force: true },
      );
      await host.store.update((draft) => {
        draft.content = draft.content.filter((entry) => entry.id !== id);
      });
    });
  },
};
