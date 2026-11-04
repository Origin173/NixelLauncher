import { randomUUID } from 'node:crypto';
import type { Instance, ResourceInstallOptions } from '../../shared/contracts';
import type { NixelHost, TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { download, inside } from '../files';
import { importModpack } from '../modpacks';
import { installContentPlan } from '../resource-dependencies';
import type { ModrinthClient } from './client';
import { contentResolver } from './dependencies';

export async function installProject(
  host: NixelHost,
  client: ModrinthClient,
  projectId: string,
  versionId: string,
  instance: Instance | undefined,
  task: TaskContext,
  options?: ResourceInstallOptions,
) {
  const project = await client.getProject(projectId, task.signal);
  if (project.project_type === 'modpack') {
    if (options?.optionalDependencies?.length)
      throw new Error(tr('optionalDependencies.packUnsupported'));
    const version = await client.getProjectVersion(versionId, task.signal);
    if (version.project_id !== projectId)
      throw new Error(tr('resources.theResourceAndVersionDoNotMatch'));
    const file = version.files.find((entry) => entry.primary) || version.files[0];
    if (!file) throw new Error(tr('resources.thisResourceVersionHasNoDownloadableFile'));
    const path = inside(host.store.cacheRoot, `${randomUUID()}.mrpack`);
    await download(file.url, path, task.signal, file.hashes, (current, total) =>
      task.report(
        total ? (current / total) * 100 : 0,
        tr('curseforge.downloadValue', { value1: project.title }),
      ),
    );
    await importModpack(host, path, task, project.title);
    return;
  }
  if (!instance) throw new Error(tr('curseforge.chooseATargetInstanceFirst'));
  await installContentPlan(
    host,
    instance,
    task,
    [{ projectId, versionId }],
    contentResolver(client, instance, task.signal),
    options?.optionalDependencies,
  );
}
