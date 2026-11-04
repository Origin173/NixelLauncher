import { json } from '../files';

export interface ProjectVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  date_published: string;
  changelog: string | null;
  files: { primary: boolean; filename: string; url: string; hashes: Record<string, string> }[];
  dependencies: {
    dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
    project_id: string | null;
    version_id: string | null;
    file_name?: string | null;
  }[];
}
interface Project {
  id: string;
  slug: string;
  title: string;
  project_type: string;
  icon_url: string | null;
  body: string;
  gallery: {
    url: string;
    title: string | null;
    description: string | null;
    featured: boolean;
    ordering: number;
  }[];
}
interface VersionFilter {
  gameVersions?: string[];
  loaders?: string[];
}

export class ModrinthClient {
  constructor(private readonly headers: Record<string, string>) {}
  private request<T>(path: string, signal?: AbortSignal, body?: unknown) {
    return json<T>(`https://api.modrinth.com/v2/${path}`, {
      signal,
      headers: { ...this.headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });
  }
  searchProjects(query: {
    query: string;
    facets: string;
    index?: string;
    limit: number;
    offset: number;
  }) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined) params.set(key, String(value));
    return this.request<{
      total_hits: number;
      hits: (Project & {
        project_id: string;
        author: string;
        description: string;
        downloads: number;
        latest_version: string;
        slug: string;
      })[];
    }>(`search?${params}`);
  }
  getProject(id: string, signal?: AbortSignal) {
    return this.request<Project>(`project/${encodeURIComponent(id)}`, signal);
  }
  getProjects(ids: string[]) {
    return this.request<Project[]>(`projects?ids=${encodeURIComponent(JSON.stringify(ids))}`);
  }
  getVersions(ids: string[]) {
    return this.request<ProjectVersion[]>(
      `versions?ids=${encodeURIComponent(JSON.stringify(ids))}`,
    );
  }
  getProjectVersion(id: string, signal?: AbortSignal) {
    return this.request<ProjectVersion>(`version/${encodeURIComponent(id)}`, signal);
  }
  getProjectVersions(id: string, filter: VersionFilter = {}, signal?: AbortSignal) {
    const query = new URLSearchParams();
    query.set('include_changelog', 'false');
    if (filter.gameVersions) query.set('game_versions', JSON.stringify(filter.gameVersions));
    if (filter.loaders) query.set('loaders', JSON.stringify(filter.loaders));
    return this.request<ProjectVersion[]>(
      `project/${encodeURIComponent(id)}/version?${query}`,
      signal,
    );
  }
  getProjectVersionByHash(hash: string, options: { algorithm: string }, signal?: AbortSignal) {
    return this.request<ProjectVersion>(
      `version_file/${encodeURIComponent(hash)}?algorithm=${options.algorithm}`,
      signal,
    );
  }
  getLatestVersionsFromHashes(
    hashes: string[],
    options: VersionFilter & { algorithm: string },
    signal?: AbortSignal,
  ) {
    return this.request<Record<string, ProjectVersion>>('version_files/update', signal, {
      hashes,
      algorithm: options.algorithm,
      game_versions: options.gameVersions ?? [],
      loaders: options.loaders ?? [],
    });
  }
}
