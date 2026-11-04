import type { Instance, Resource, ResourceQuery } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import type { CurseForgeClient } from './client';
import type { CurseForgeProject } from './models';
import { curseforgeId, id, loaderNames, loaderTypes, sortFields } from './rules';

const searchLimit = 10_000;

export async function searchProjects(
  client: CurseForgeClient,
  query: ResourceQuery,
  instance?: Instance,
) {
  const classes = await client.categoryIds();
  const classId = [...classes].find(([, category]) => category === query.category)?.[0];
  if (query.category && query.category !== 'all' && !classId)
    throw new Error(tr('curseforge.curseforgeDoesNotSupportThisCategory'));
  const offset = Math.max(0, query.offset ?? 0);
  const countOnly = offset >= searchLimit;
  const pageSize = countOnly ? 1 : Math.min(20, searchLimit - offset);
  const result = await client.request<CurseForgeProject[]>('mods/search', {
    gameId: 432,
    classId,
    searchFilter: query.query,
    gameVersion: instance?.version,
    modLoaderType:
      instance && query.category === 'mods' ? loaderTypes[instance.loader] || undefined : undefined,
    sortField: sortFields[query.sort || 'relevance'] || 2,
    sortOrder: 'desc',
    index: countOnly ? 0 : offset,
    pageSize,
  });
  const total = result.pagination?.totalCount;
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0)
    throw new Error(tr('curseforge.invalidSearchTotal'));
  // Past the browsing limit, keep this source's total without replaying any items.
  if (countOnly) return { items: [], total, hasMore: false };
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
  return { items, total, hasMore: offset + pageSize < Math.min(total, searchLimit) };
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
