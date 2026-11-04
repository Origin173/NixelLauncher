import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { NixelHost, TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { download } from '../files';
import type { ModrinthClient } from './client';
export async function downloadPack(
  host: NixelHost,
  client: ModrinthClient,
  projectId: string,
  versionId: string,
  task: TaskContext,
) {
  const project = await client.getProject(projectId, task.signal);
  const version = await client.getProjectVersion(versionId, task.signal);
  if (project.project_type !== 'modpack' || version.project_id !== projectId)
    throw new Error(tr('resources.theResourceAndVersionDoNotMatch'));
  const file = version.files.find((file) => file.primary) || version.files[0];
  if (!file) throw new Error(tr('resources.thisResourceVersionHasNoDownloadableFile'));
  const path = join(host.store.cacheRoot, `${randomUUID()}.mrpack`);
  await download(file.url, path, task.signal, file.hashes);
  return path;
}
