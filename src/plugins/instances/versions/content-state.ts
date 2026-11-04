import { createHash } from 'node:crypto';
import type { InstalledContent, Instance, InstanceVersionTarget } from '../../../shared/contracts';
import type { NixelHost } from '../../../shared/host-api';
import { checkedPath } from '../../file-transaction';
import { hashFile } from '../../files';
import { contentDirectories, scanContent } from '../../resource-files';
export interface ContentFileState {
  id: string;
  path: string;
  sha256: string;
}
export async function contentState(
  host: NixelHost,
  instance: Instance,
  target: InstanceVersionTarget,
  signal?: AbortSignal,
) {
  const entries = (await scanContent(host, instance)).sort((a, b) => a.id.localeCompare(b.id));
  const files: ContentFileState[] = [];
  for (const entry of entries) {
    const path = contentPath(entry);
    files.push({
      id: entry.id,
      path,
      sha256: await hashFile(await checkedPath(instance.directory, path), 'sha256', signal),
    });
  }
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        target,
        current: {
          version: instance.version,
          loader: instance.loader,
          loaderVersion: instance.loaderVersion,
          launchVersion: instance.launchVersion,
          providers: instance.providers,
          providerConfig: instance.providerConfig,
        },
        content: entries.map((entry) => ({
          id: entry.id,
          file: entry.fileName,
          category: entry.category,
          enabled: entry.enabled,
          source: entry.source,
          project: entry.projectId,
          version: entry.versionId,
        })),
        files,
      }),
    )
    .digest('hex');
  return { entries, files, fingerprint };
}
export function contentPath(entry: Pick<InstalledContent, 'category' | 'fileName'>) {
  return `${contentDirectories[entry.category]}/${entry.fileName}`;
}
