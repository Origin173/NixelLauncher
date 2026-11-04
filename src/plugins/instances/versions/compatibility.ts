import type { InstalledContent, Instance, VersionContentReview } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/error-message';
import type { NixelHost } from '../../../shared/host-api';
import type { ResourceProvider } from '../../providers';
import { normalizeResourceSource } from '../../resource-files';

export async function reviewContent(
  host: NixelHost,
  target: Instance,
  entries: InstalledContent[],
  signal?: AbortSignal,
) {
  async function review(entry: InstalledContent): Promise<VersionContentReview> {
    signal?.throwIfAborted();
    let status: VersionContentReview['status'] = 'unknown';
    let reason: string | undefined;
    let candidates: VersionContentReview['candidates'] = [];
    const source = normalizeResourceSource(entry.source);
    if (source && entry.projectId && entry.versionId) {
      try {
        const versions = await host.providers
          .get<ResourceProvider>('resources', source)
          .versions(entry.projectId, target, signal);
        candidates = versions.map((version) => ({ id: version.id, name: version.name }));
        status = candidates.some((candidate) => candidate.id === entry.versionId)
          ? 'compatible'
          : candidates.length
            ? 'update-available'
            : 'incompatible';
      } catch (error) {
        signal?.throwIfAborted();
        reason = errorMessage(error);
      }
    }
    return {
      projectId: entry.projectId,
      candidates,
      id: entry.id,
      name: entry.name,
      fileName: entry.fileName,
      icon: entry.icon,
      category: entry.category,
      enabled: entry.enabled,
      source,
      status,
      reason,
    };
  }
  const results: VersionContentReview[] = [];
  // Bound API concurrency while retaining input order for the review fingerprint.
  for (let offset = 0; offset < entries.length; offset += 4)
    results.push(...(await Promise.all(entries.slice(offset, offset + 4).map(review))));
  return results;
}
