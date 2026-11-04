import { json } from './files';

export interface ProjectVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  date_published: string;
  files: { primary: boolean; filename: string; url: string; hashes: Record<string, string> }[];
  dependencies: { dependency_type: string; project_id: string | null; version_id: string | null }[];
}
interface Project {
  title: string;
  project_type: string;
  icon_url: string | null;
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
  getProjectVersion(id: string, signal?: AbortSignal) {
    return this.request<ProjectVersion>(`version/${encodeURIComponent(id)}`, signal);
  }
  getProjectVersions(id: string, filter: VersionFilter = {}, signal?: AbortSignal) {
    const query = new URLSearchParams();
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
