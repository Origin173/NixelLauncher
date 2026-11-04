import type { Instance, Resource, ResourceQuery } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import type { CurseForgeClient } from './client';
import type { CurseForgeProject } from './models';
import { curseforgeId, id, loaderNames, loaderTypes, sortFields } from './rules';
export async function searchProjects(
  client: CurseForgeClient,
  query: ResourceQuery,
  instance?: Instance,
) {
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
      instance && query.category === 'mods' ? loaderTypes[instance.loader] || undefined : undefined,
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
              project.latestFiles[0]?.gameVersions.find((version) => /^\d/.test(version)) || '',
            color: 'orange',
            icon: project.logo?.thumbnailUrl,
            url: project.links.websiteUrl,
          },
        ]
      : [];
  });
  return { items, total: Math.min(result.pagination?.totalCount || items.length, 10000) };
}
export async function listVersions(
  client: CurseForgeClient,
  projectId: string,
  instance?: Instance,
  signal?: AbortSignal,
) {
  return (await client.versions(id(projectId), instance, signal)).map((file) => ({
    id: String(file.id),
    name: file.displayName,
    version: file.displayName,
    gameVersions: file.gameVersions.filter((version) => !loaderNames.has(version.toLowerCase())),
    loaders: file.gameVersions
      .filter((version) => loaderNames.has(version.toLowerCase()))
      .map((version) => version.toLowerCase()),
    publishedAt: file.fileDate,
  }));
}
