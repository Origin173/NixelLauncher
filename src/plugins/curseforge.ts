import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Context } from 'cordis';
import { serviceEnvironment } from '../host/service-environment';
import type { ContentCategory, Instance, Resource } from '../shared/contracts';
import type { TaskContext } from '../shared/host-api';
import { tr } from '../shared/i18n';
import { download, hashFile } from './files';
import { importModpack } from './modpacks';
import type { ResourceProvider } from './providers';
import {
  assertRequiredContentEnabled,
  contentDirectories,
  installContentFile,
  normalizeResourceSource,
} from './resource-files';

export const curseforgeId = 'nixel.resources.curseforge';
type Category = ContentCategory | 'modpacks';
interface CurseForgeClass {
  id: number;
  slug: string;
  name: string;
}
interface CurseForgeProject {
  id: number;
  classId: number;
  name: string;
  summary: string;
  slug: string;
  downloadCount: number;
  authors: { name: string }[];
  logo?: { thumbnailUrl: string };
  links: { websiteUrl: string };
  allowModDistribution: boolean | null;
  isAvailable: boolean;
  latestFiles: { gameVersions: string[] }[];
}
interface CurseForgeFile {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  fileDate: string;
  fileLength: number;
  isAvailable: boolean;
  isServerPack?: boolean;
  downloadUrl: string | null;
  gameVersions: string[];
  hashes: { value: string; algo: number }[];
  dependencies: { modId: number; relationType: number }[];
}
interface ApiResponse<T> {
  data: T;
  pagination?: { totalCount: number; resultCount: number; index: number; pageSize: number };
}
export interface CurseForgePackFile {
  projectID: number;
  fileID: number;
  required?: boolean;
}
export interface CurseForgeResourceProvider extends ResourceProvider {
  prepareFiles(files: CurseForgePackFile[], signal: AbortSignal): Promise<void>;
  installFiles(files: CurseForgePackFile[], instance: Instance, task: TaskContext): Promise<void>;
}
const loaderTypes: Record<Instance['loader'], number> = {
  Vanilla: 0,
  Forge: 1,
  Fabric: 4,
  Quilt: 5,
  NeoForge: 6,
};
const classSlugs: Record<Category, string[]> = {
  mods: ['mc-mods', 'mods'],
  modpacks: ['modpacks'],
  resourcepacks: ['texture-packs', 'resource-packs'],
  shaders: ['shaders', 'shader-packs'],
};
const sortFields: Record<string, number> = {
  relevance: 2,
  downloads: 6,
  follows: 2,
  newest: 11,
  updated: 3,
};
const loaderNames = new Set(['forge', 'fabric', 'quilt', 'neoforge', 'cauldron', 'liteloader']);

function id(value: string) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0)
    throw new Error(tr('curseforge.invalidCurseforgeProjectOrFileId'));
  return Number(value);
}
function fileHashes(file: CurseForgeFile): Record<string, string> {
  const sha1 = file.hashes.find((hash) => hash.algo === 1)?.value;
  const md5 = file.hashes.find((hash) => hash.algo === 2)?.value;
  if (!sha1 && !md5)
    throw new Error(tr('curseforge.curseforgeFileHasNoChecksumValue', { value1: file.fileName }));
  return sha1 ? { sha1 } : { md5: md5 as string };
}
function assertDownload(project: CurseForgeProject, file: CurseForgeFile) {
  if (project.allowModDistribution === false || !file.downloadUrl)
    throw new Error(
      tr('curseforge.theAuthorHasDisabledThirdPartyDownloads', { value1: project.name }),
    );
  if (!project.isAvailable || !file.isAvailable || file.isServerPack)
    throw new Error(
      tr('curseforge.thisCurseforgeFileCannotBeInstalledOn', { value1: file.displayName }),
    );
  fileHashes(file);
}
function isCompatible(file: CurseForgeFile, instance: Instance, category: Category) {
  if (!file.gameVersions.includes(instance.version)) return false;
  if (category !== 'mods') return true;
  const declared = file.gameVersions
    .map((version) => version.toLowerCase())
    .filter((version) => loaderNames.has(version));
  return declared.length
    ? declared.includes(instance.loader.toLowerCase())
    : instance.loader !== 'Vanilla';
}

class CurseForgeClient {
  private classes?: CurseForgeClass[];

  async request<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    signal?: AbortSignal,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const key = serviceEnvironment.curseforgeApiKey;
    if (!key) throw new Error(tr('curseforge.curseforgeIsNotConfiguredSetCurseforgeApi'));
    const url = new URL(`https://api.curseforge.com/v1/${path}`);
    for (const [name, value] of Object.entries(params))
      if (value !== undefined) url.searchParams.set(name, String(value));
    const response = await fetch(url, {
      signal,
      method: body ? 'POST' : 'GET',
      headers: {
        Accept: 'application/json',
        'x-api-key': key,
        'User-Agent': 'NixelLauncher/0.1.0',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 401 || response.status === 403)
      throw new Error(tr('curseforge.curseforgeDeniedAccessCheckCurseforgeApiKey'));
    if (!response.ok)
      throw new Error(
        tr('curseforge.curseforgeRequestFailedHttpValue', { value1: response.status }),
      );
    return response.json() as Promise<ApiResponse<T>>;
  }
  async categoryIds(signal?: AbortSignal) {
    this.classes ??= (
      await this.request<CurseForgeClass[]>(
        'categories',
        { gameId: 432, classesOnly: 'true' },
        signal,
      )
    ).data;
    return new Map(
      this.classes.flatMap((item): [number, Category][] => {
        const match = (Object.entries(classSlugs) as [Category, string[]][]).find(([, slugs]) =>
          slugs.includes(item.slug.toLowerCase()),
        );
        return match ? [[item.id, match[0]]] : [];
      }),
    );
  }
  async project(projectId: number, signal?: AbortSignal) {
    const project = (await this.request<CurseForgeProject>(`mods/${projectId}`, {}, signal)).data;
    return project;
  }
  async file(projectId: number, fileId: number, signal?: AbortSignal) {
    const file = (
      await this.request<CurseForgeFile>(`mods/${projectId}/files/${fileId}`, {}, signal)
    ).data;
    if (file.modId !== projectId)
      throw new Error(tr('curseforge.theCurseforgeProjectAndFileDoNot'));
    return file;
  }
  async versions(projectId: number, instance?: Instance, signal?: AbortSignal) {
    const project = await this.project(projectId, signal);
    const category = (await this.categoryIds(signal)).get(project.classId);
    if (!category) throw new Error(tr('curseforge.unsupportedCurseforgeResourceType'));
    const files: CurseForgeFile[] = [];
    for (let index = 0; index < 10000; index += 50) {
      const result = await this.request<CurseForgeFile[]>(
        `mods/${projectId}/files`,
        {
          gameVersion: instance?.version,
          modLoaderType:
            instance && category === 'mods' ? loaderTypes[instance.loader] || undefined : undefined,
          index,
          pageSize: 50,
        },
        signal,
      );
      files.push(
        ...result.data.filter(
          (file) =>
            file.isAvailable &&
            !file.isServerPack &&
            (!instance || isCompatible(file, instance, category)),
        ),
      );
      if (
        result.data.length < 50 ||
        (result.pagination && index + result.data.length >= result.pagination.totalCount)
      )
        break;
    }
    return files.sort((a, b) => Date.parse(b.fileDate) - Date.parse(a.fileDate));
  }
  async prepareFiles(files: CurseForgePackFile[], signal: AbortSignal) {
    for (let offset = 0; offset < files.length; offset += 50) {
      const entries = files.slice(offset, offset + 50);
      const [projects, versions] = await Promise.all([
        this.request<CurseForgeProject[]>('mods', {}, signal, {
          modIds: [...new Set(entries.map((entry) => entry.projectID))],
        }),
        this.request<CurseForgeFile[]>('mods/files', {}, signal, {
          fileIds: entries.map((entry) => entry.fileID),
        }),
      ]);
      const projectsById = new Map(projects.data.map((project) => [project.id, project]));
      const filesById = new Map(versions.data.map((file) => [file.id, file]));
      for (const entry of entries) {
        const project = projectsById.get(entry.projectID);
        const file = filesById.get(entry.fileID);
        if (!project || !file || file.modId !== entry.projectID)
          throw new Error(
            tr('curseforge.modpackFileUnavailableValueValue', {
              value1: entry.projectID,
              value2: entry.fileID,
            }),
          );
        assertDownload(project, file);
      }
    }
    // Even an empty manifest requires the configured provider to be available.
    await this.categoryIds(signal);
  }
}

export const curseforgePlugin = {
  name: curseforgeId,
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    const client = new CurseForgeClient();
    async function installFiles(
      entries: CurseForgePackFile[],
      instance: Instance | undefined,
      task: TaskContext,
      allowPack = false,
    ) {
      const pinned = new Map(entries.map((entry) => [entry.projectID, entry.fileID]));
      const visited = new Set<number>();
      async function installVersion(projectId: number, fileId: number, root = false) {
        task.signal.throwIfAborted();
        if (!root && instance)
          assertRequiredContentEnabled(host, instance, curseforgeId, String(projectId));
        if (visited.has(fileId)) return;
        visited.add(fileId);
        const [project, file, classes] = await Promise.all([
          client.project(projectId, task.signal),
          client.file(projectId, fileId, task.signal),
          client.categoryIds(task.signal),
        ]);
        assertDownload(project, file);
        const category = classes.get(project.classId);
        if (!category) throw new Error(tr('curseforge.unsupportedCurseforgeResourceType'));
        if (category === 'modpacks') {
          if (!allowPack || !root)
            throw new Error(tr('curseforge.aCurseforgeModpackManifestOrDependencyCannot'));
          const path = join(host.store.cacheRoot, `${randomUUID()}.zip`);
          await download(
            file.downloadUrl as string,
            path,
            task.signal,
            fileHashes(file),
            (current, total) =>
              task.report(
                total ? (current / total) * 100 : 0,
                tr('curseforge.downloadValue', { value1: project.name }),
              ),
          );
          await importModpack(host, path, task, project.name);
          return;
        }
        if (!instance) throw new Error(tr('curseforge.chooseATargetInstanceFirst'));
        const target = instance;
        if (!isCompatible(file, target, category))
          throw new Error(
            tr('curseforge.curseforgeFileValueIsIncompatibleWithThis', {
              value1: file.displayName,
            }),
          );
        for (const dependency of file.dependencies.filter((item) => item.relationType === 3)) {
          const selected =
            pinned.get(dependency.modId) ||
            (await client.versions(dependency.modId, target, task.signal))[0]?.id;
          if (!selected)
            throw new Error(
              tr('curseforge.noCompatibleRequiredCurseforgeDependencyFoundValue', {
                value1: dependency.modId,
              }),
            );
          await installVersion(dependency.modId, selected);
        }
        await installContentFile(host, target, task, {
          source: curseforgeId,
          projectId: String(projectId),
          versionId: String(fileId),
          name: project.name,
          icon: project.logo?.thumbnailUrl,
          version: file.displayName,
          category,
          fileName: file.fileName,
          url: file.downloadUrl as string,
          hashes: fileHashes(file),
        });
      }
      for (const entry of entries) await installVersion(entry.projectID, entry.fileID, true);
    }
    const provider: CurseForgeResourceProvider = {
      async search(query, instance) {
        const classes = await client.categoryIds();
        const classId = [...classes].find(([, category]) => category === query.category)?.[0];
        if (query.category && query.category !== 'all' && !classId)
          throw new Error(tr('curseforge.curseforgeDoesNotSupportThisCategory'));
        const result = await client.request<CurseForgeProject[]>('mods/search', {
          gameId: 432,
          classId,
          searchFilter: query.query,
          gameVersion: instance?.version,
          modLoaderType:
            instance && query.category === 'mods'
              ? loaderTypes[instance.loader] || undefined
              : undefined,
          sortField: sortFields[query.sort || 'relevance'] || 2,
          sortOrder: 'desc',
          index: Math.max(0, Math.min(query.offset || 0, 9980)),
          pageSize: 20,
        });
        const items: Resource[] = result.data.flatMap((project) => {
          const category = classes.get(project.classId);
          return category
            ? [
                {
                  id: String(project.id),
                  name: project.name,
                  author: project.authors.map((author) => author.name).join(', '),
                  desc: project.summary,
                  category,
                  source: curseforgeId,
                  downloads: project.downloadCount.toLocaleString(),
                  version:
                    project.latestFiles[0]?.gameVersions.find((version) => /^\d/.test(version)) ||
                    '',
                  color: 'orange',
                  icon: project.logo?.thumbnailUrl,
                  url: project.links.websiteUrl,
                },
              ]
            : [];
        });
        return { items, total: Math.min(result.pagination?.totalCount || items.length, 10000) };
      },
      async versions(projectId, instance) {
        return (await client.versions(id(projectId), instance)).map((file) => ({
          id: String(file.id),
          name: file.displayName,
          version: file.displayName,
          gameVersions: file.gameVersions.filter(
            (version) => !loaderNames.has(version.toLowerCase()),
          ),
          loaders: file.gameVersions
            .filter((version) => loaderNames.has(version.toLowerCase()))
            .map((version) => version.toLowerCase()),
          publishedAt: file.fileDate,
        }));
      },
      async install(projectId, versionId, instance, task) {
        await installFiles(
          [{ projectID: id(projectId), fileID: id(versionId) }],
          instance,
          task,
          true,
        );
      },
      prepareFiles: (files, signal) => client.prepareFiles(files, signal),
      installFiles,
      async checkUpdates(instance, task) {
        const entries = host.store
          .read()
          .content.filter(
            (entry) =>
              entry.instance === instance.id &&
              normalizeResourceSource(entry.source) === curseforgeId &&
              entry.projectId &&
              entry.versionId,
          );
        const errors: Error[] = [];
        for (const [index, entry] of entries.entries()) {
          task.signal.throwIfAborted();
          task.report(
            (index / entries.length) * 100,
            tr('content.checkingFile', { name: entry.name }),
          );
          try {
            const projectId = id(entry.projectId as string);
            const latest = (await client.versions(projectId, instance, task.signal))[0];
            const current = await client.file(
              projectId,
              id(entry.versionId as string),
              task.signal,
            );
            const hashes = fileHashes(current);
            const algorithm = hashes.sha1 ? 'sha1' : 'md5';
            const checksum = await hashFile(
              join(instance.directory, contentDirectories[entry.category], entry.fileName),
              algorithm,
              task.signal,
            );
            if (checksum !== hashes[algorithm])
              throw new Error(
                tr('curseforge.localFileValueWasModifiedReviewIt', { value1: entry.fileName }),
              );
            await host.store.update((draft) => {
              const item = draft.content.find((content) => content.id === entry.id);
              if (item)
                item.update =
                  latest &&
                  latest.id !== current.id &&
                  Date.parse(latest.fileDate) > Date.parse(current.fileDate)
                    ? { versionId: String(latest.id), version: latest.displayName }
                    : undefined;
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
        id: curseforgeId,
        pluginId: curseforgeId,
        kind: 'resources',
        name: 'CurseForge',
        capabilities: ['mods', 'resourcepacks', 'shaders', 'modpacks'],
      },
      provider,
    );
  },
};
