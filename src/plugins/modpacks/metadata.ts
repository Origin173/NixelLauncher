import { randomUUID } from 'node:crypto';
import type { InstalledContent } from '../../shared/contracts';
import type { ContentDownload } from '../resource-files';
export function contentRecords(instanceId: string, files: ContentDownload[]): InstalledContent[] {
  return files.map((file) => ({
    id: randomUUID(),
    instance: instanceId,
    name: file.name,
    version: file.version,
    category: file.category,
    fileName: file.fileName,
    enabled: true,
    color: 'green',
    icon: file.icon,
    source: file.source,
    projectId: file.projectId,
    versionId: file.versionId,
  }));
}
