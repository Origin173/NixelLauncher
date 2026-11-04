import type { Instance, ResourceQuery } from '../../shared/contracts';
import type { ModrinthClient } from './client';
import { categories, projectTypes, resourcesId, versionOptions } from './rules';
export async function searchProjects(
  client: ModrinthClient,
  query: ResourceQuery,
  instance?: Instance,
) {
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
    index: ['relevance', 'downloads', 'follows', 'newest', 'updated'].includes(query.sort || '')
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
}
export async function listVersions(
  client: ModrinthClient,
  projectId: string,
  instance?: Instance,
  signal?: AbortSignal,
) {
  return (await client.getProjectVersions(projectId, versionOptions(instance), signal)).map(
    (version) => ({
      id: version.id,
      name: version.name,
      version: version.version_number,
      gameVersions: version.game_versions,
      loaders: version.loaders,
      publishedAt: version.date_published,
    }),
  );
}
