import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { NixelHost, TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { download } from '../files';
import type { CurseForgeClient } from './client';
import { assertDownload, fileHashes } from './rules';
export async function downloadPack(
  host: NixelHost,
  client: CurseForgeClient,
  projectId: number,
  versionId: number,
  task: TaskContext,
) {
  const project = await client.project(projectId, task.signal);
  if ((await client.categoryIds(task.signal)).get(project.classId) !== 'modpacks')
    throw new Error(tr('resources.theResourceAndVersionDoNotMatch'));
  const file = await client.file(projectId, versionId, task.signal);
  assertDownload(project, file);
  const path = join(host.store.cacheRoot, `${randomUUID()}.zip`);
  await download(file.downloadUrl as string, path, task.signal, fileHashes(file));
  return path;
}
