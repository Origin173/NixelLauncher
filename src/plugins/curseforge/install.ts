import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Instance, ResourceInstallOptions } from '../../shared/contracts';
import type { NixelHost, TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { download } from '../files';
import { importModpack } from '../modpacks';
import type { CurseForgePackFile } from '../providers';
import { installContentPlan } from '../resource-dependencies';
import type { CurseForgeClient } from './client';
import { contentResolver } from './dependencies';
import { assertDownload, fileHashes } from './rules';

export async function installFiles(
  host: NixelHost,
  client: CurseForgeClient,
  entries: CurseForgePackFile[],
  instance: Instance | undefined,
  task: TaskContext,
  allowPack = false,
  options?: ResourceInstallOptions,
) {
  const root = entries[0];
  if (allowPack && entries.length === 1 && root) {
    const project = await client.project(root.projectID, task.signal);
    const classes = await client.categoryIds(task.signal);
    if (classes.get(project.classId) === 'modpacks') {
      if (options?.optionalDependencies?.length)
        throw new Error(tr('optionalDependencies.packUnsupported'));
      const file = await client.file(root.projectID, root.fileID, task.signal);
      assertDownload(project, file);
      const path = join(host.store.cacheRoot, `${randomUUID()}.zip`);
      await download(
        file.downloadUrl as string,
        path,
        task.signal,
        fileHashes(file),
        (current, total) =>
          task.report(
            total ? (current / total) * 100 : 0,
            tr('curseforge.downloadValue', { value1: project.name }),
          ),
      );
      await importModpack(host, path, task, project.name);
      return;
    }
  }
  if (!instance) throw new Error(tr('curseforge.chooseATargetInstanceFirst'));
  await installContentPlan(
    host,
    instance,
    task,
    entries.map((entry) => ({
      projectId: String(entry.projectID),
      versionId: String(entry.fileID),
    })),
    contentResolver(client, instance, task.signal),
    options?.optionalDependencies,
  );
}
