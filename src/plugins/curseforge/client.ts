import { serviceEnvironment } from '../../host/service-environment';
import type { Instance } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import type { CurseForgePackFile } from '../providers';
import type { ApiResponse, CurseForgeClass, CurseForgeFile, CurseForgeProject } from './models';
import { assertDownload, type Category, classSlugs, isCompatible, loaderTypes } from './rules';
export class CurseForgeClient {
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
