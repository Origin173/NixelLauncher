import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { link, lstat, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ModrinthV2Client, type ProjectVersion } from '@xmcl/modrinth';
import type { Context } from 'cordis';
import { serviceEnvironment } from '../host/service-environment';
import type {
  ContentCategory,
  InstalledContent,
  Instance,
  ResourceQuery,
} from '../shared/contracts';
import type { NixelHost, TaskContext } from '../shared/host-api';
import { commandsFor } from './commands';
import { download, hashFile, inside } from './files';
import { assertInstanceIdle, getInstance } from './game';
import { importModpack } from './modpacks';
import type { ResourceProvider } from './providers';
import {
  assertRequiredContentEnabled,
  contentDirectories,
  installContentFile,
  normalizeResourceSource,
} from './resource-files';

export const resourcesId = 'nixel.resources.modrinth';
const categories: Record<string, ContentCategory | '整合包'> = {
  mod: '模组',
  resourcepack: '资源包',
  shader: '光影',
  modpack: '整合包',
};
const projectTypes: Record<string, string> = {
  模组: 'mod',
  资源包: 'resourcepack',
  光影: 'shader',
  整合包: 'modpack',
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

export async function scanContent(host: NixelHost, instance: Instance) {
  const known = host.store.read().content.filter((entry) => entry.instance === instance.id);
  const found: InstalledContent[] = [];
  for (const [category, directory] of Object.entries(contentDirectories)) {
    const root = join(instance.directory, directory);
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries)
      if (entry.isFile() && /\.(jar|zip)(\.disabled)?$/i.test(entry.name)) {
        const previous = known.find(
          (item) => item.category === category && item.fileName === entry.name,
        );
        found.push(
          previous || {
            id: randomUUID(),
            instance: instance.id,
            name: entry.name.replace(/\.(jar|zip)(\.disabled)?$/i, ''),
            version: '本地文件',
            category: category as ContentCategory,
            fileName: entry.name,
            enabled: !entry.name.endsWith('.disabled'),
            color: 'green',
          },
        );
      }
  }
  await host.store.update((draft) => {
    draft.content = [...draft.content.filter((entry) => entry.instance !== instance.id), ...found];
  });
  return found;
}

export const resourcesPlugin = {
  name: resourcesId,
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    const client = new ModrinthV2Client({
      headers: {
        'User-Agent': 'NixelLauncher/0.1.0',
        ...(serviceEnvironment.modrinthToken
          ? { Authorization: serviceEnvironment.modrinthToken }
          : {}),
      },
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
            category: categories[hit.project_type] || '模组',
            source: resourcesId,
            downloads: hit.downloads.toLocaleString(),
            version: hit.latest_version,
            color: 'green',
            icon: hit.icon_url,
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
              `Modrinth 依赖版本冲突：项目 ${projectId} 同时要求 ${selected} 和 ${versionId}，请调整依赖版本`,
            );
          resolvedProjects.set(projectId, versionId);
          if (visited.has(versionId)) return;
          visited.add(versionId);
          const version = await client.getProjectVersion(versionId, task.signal);
          if (version.project_id !== projectId) throw new Error('资源与版本不匹配');
          const project = await client.getProject(projectId, task.signal);
          const category = categories[project.project_type];
          const file = version.files.find((entry) => entry.primary) || version.files[0];
          if (!file) throw new Error('此资源版本没有下载文件');
          if (category === '整合包') {
            const path = inside(host.store.cacheRoot, `${randomUUID()}.mrpack`);
            await download(file.url, path, task.signal, file.hashes, (current, total) =>
              task.report(total ? (current / total) * 100 : 0, `下载 ${project.title}`),
            );
            await importModpack(host, path, task, project.title);
            return;
          }
          if (!instance) throw new Error('请先选择目标实例');
          const targetInstance = instance;
          if (!compatible(version, targetInstance))
            throw new Error(`版本 ${version.version_number} 与此实例的游戏版本或加载器不兼容`);
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
              throw new Error(`无法解析必需依赖：${dependency.project_id || '未知依赖'}`);
            await installVersion(required.project_id, required.id, true);
          }
          if (!category) throw new Error('不支持的资源类型');
          await installContentFile(host, targetInstance, task, {
            source: resourcesId,
            projectId,
            versionId,
            name: project.title,
            version: version.version_number,
            category,
            fileName: file.filename,
            url: file.url,
            hashes: file.hashes,
          });
        }
        await installVersion(projectId, versionId);
      },
      async checkUpdates(instance) {
        const entries = (await scanContent(host, instance)).filter(
          (entry) => !entry.source || normalizeResourceSource(entry.source) === resourcesId,
        );
        for (const entry of entries) {
          const path = inside(
            join(instance.directory, contentDirectories[entry.category]),
            entry.fileName,
          );
          const hash = await hashFile(path);
          const versions = await client.getLatestVersionsFromHashes([hash], {
            algorithm: 'sha512',
            ...versionOptions(instance),
          });
          const latest = versions[hash];
          if (!latest) continue;
          const current = await client.getProjectVersionByHash(hash, { algorithm: 'sha512' });
          await host.store.update((draft) => {
            const item = draft.content.find((content) => content.id === entry.id);
            if (item) {
              item.projectId = current.project_id;
              item.versionId = current.id;
              item.version = current.version_number;
              item.source = resourcesId;
              item.update = current.id !== latest.id ? latest.version_number : undefined;
            }
          });
        }
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
    const selected = (instanceId?: string, source?: string) => {
      const instance = instanceId ? getInstance(host, instanceId) : undefined;
      const id =
        normalizeResourceSource(source) ||
        instance?.providers.resources ||
        host.store.read().settings.providers.resources;
      return { id, instance, provider: host.providers.get<ResourceProvider>('resources', id) };
    };
    command('resources.search', (query: ResourceQuery) => {
      const selection = selected(query.instanceId, query.source);
      return selection.provider.search(query, selection.instance);
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
            '安装资源',
            '解析资源与依赖',
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
    command('content.list', ({ instanceId }: { instanceId: string }) =>
      scanContent(host, getInstance(host, instanceId)),
    );
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
          throw new Error('请选择内容类型与本地文件');
        return {
          taskId: host.tasks.start(
            '导入本地内容',
            '复制本地文件',
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
                  const extension = category === '模组' ? /\.jar$/i : /\.zip$/i;
                  if (!extension.test(name) || !(await lstat(path)).isFile())
                    throw new Error(`不支持的本地文件：${name}`);
                  const target = inside(directory, name);
                  if (
                    names.has(name.toLowerCase()) ||
                    (await lstat(target).then(
                      () => true,
                      () => false,
                    ))
                  )
                    throw new Error(`文件已存在，请先移除或重命名：${name}`);
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
                  task.report(((index + 1) / files.length) * 100, `导入 ${file.name}`);
                }
                task.signal.throwIfAborted();
                await scanContent(host, instance);
                task.log(`已导入 ${files.length} 个本地文件`);
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
        if (!entry) throw new Error('文件不存在，请刷新列表');
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
          throw new Error('目标文件已存在');
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
      if (!entry) throw new Error('文件不存在');
      await rm(
        inside(join(instance.directory, contentDirectories[entry.category]), entry.fileName),
        { force: true },
      );
      await host.store.update((draft) => {
        draft.content = draft.content.filter((entry) => entry.id !== id);
      });
    });
    command('content.checkUpdates', async ({ instanceId }: { instanceId: string }) => {
      const instance = getInstance(host, instanceId);
      assertInstanceIdle(host, instanceId);
      const entries = await scanContent(host, instance);
      const sources = new Set(
        entries.map(
          (entry) =>
            normalizeResourceSource(entry.source) ||
            instance.providers.resources ||
            host.store.read().settings.providers.resources,
        ),
      );
      for (const source of sources)
        await host.providers.get<ResourceProvider>('resources', source).checkUpdates(instance);
      return host.store.read().content.filter((entry) => entry.instance === instanceId);
    });
  },
};
