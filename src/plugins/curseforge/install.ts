import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Instance } from '../../shared/contracts';
import type { NixelHost, TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { download } from '../files';
import { importModpack } from '../modpacks';
import type { CurseForgePackFile } from '../providers';
import { assertRequiredContentEnabled, installContentFile } from '../resource-files';
import type { CurseForgeClient } from './client';
import { assertDownload, curseforgeId, fileHashes, isCompatible } from './rules';
export async function installFiles(
  host: NixelHost,
  client: CurseForgeClient,
  entries: CurseForgePackFile[],
  instance: Instance | undefined,
  task: TaskContext,
  allowPack = false,
) {
  const pinned = new Map(entries.map((entry) => [entry.projectID, entry.fileID]));
  const visited = new Set<number>();
  async function installVersion(projectId: number, fileId: number, root = false) {
    task.signal.throwIfAborted();
    if (!root && instance)
      assertRequiredContentEnabled(host, instance, curseforgeId, String(projectId));
    if (visited.has(fileId)) return;
    visited.add(fileId);
    const [project, file, classes] = await Promise.all([
      client.project(projectId, task.signal),
      client.file(projectId, fileId, task.signal),
      client.categoryIds(task.signal),
    ]);
    assertDownload(project, file);
    const category = classes.get(project.classId);
    if (!category) throw new Error(tr('curseforge.unsupportedCurseforgeResourceType'));
    if (category === 'modpacks') {
      if (!allowPack || !root)
        throw new Error(tr('curseforge.aCurseforgeModpackManifestOrDependencyCannot'));
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
    if (!instance) throw new Error(tr('curseforge.chooseATargetInstanceFirst'));
    const target = instance;
    if (!isCompatible(file, target, category))
      throw new Error(
        tr('curseforge.curseforgeFileValueIsIncompatibleWithThis', {
          value1: file.displayName,
        }),
      );
    for (const dependency of file.dependencies.filter((item) => item.relationType === 3)) {
      const selected =
        pinned.get(dependency.modId) ||
        (await client.versions(dependency.modId, target, task.signal))[0]?.id;
      if (!selected)
        throw new Error(
          tr('curseforge.noCompatibleRequiredCurseforgeDependencyFoundValue', {
            value1: dependency.modId,
          }),
        );
      await installVersion(dependency.modId, selected);
    }
    await installContentFile(host, target, task, {
      source: curseforgeId,
      projectId: String(projectId),
      versionId: String(fileId),
      name: project.name,
      icon: project.logo?.thumbnailUrl,
      version: file.displayName,
      category,
      fileName: file.fileName,
      url: file.downloadUrl as string,
      hashes: fileHashes(file),
    });
  }
  for (const entry of entries) await installVersion(entry.projectID, entry.fileID, true);
}
