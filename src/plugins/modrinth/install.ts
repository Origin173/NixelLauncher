import { randomUUID } from 'node:crypto';
import type { Instance } from '../../shared/contracts';
import type { NixelHost, TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { download, inside } from '../files';
import { importModpack } from '../modpacks';
import { assertRequiredContentEnabled, installContentFile } from '../resource-files';
import type { ModrinthClient } from './client';
import { categories, compatible, resourcesId, versionOptions } from './rules';
export async function installProject(
  host: NixelHost,
  client: ModrinthClient,
  projectId: string,
  versionId: string,
  instance: Instance | undefined,
  task: TaskContext,
) {
  const visited = new Set<string>();
  const resolvedProjects = new Map<string, string>();
  async function installVersion(projectId: string, versionId: string, required = false) {
    task.signal.throwIfAborted();
    if (required && instance) assertRequiredContentEnabled(host, instance, resourcesId, projectId);
    const selected = resolvedProjects.get(projectId);
    if (selected && selected !== versionId)
      throw new Error(
        tr('resources.modrinthDependencyConflictProjectValueRequiresBoth', {
          value1: projectId,
          value2: selected,
          value3: versionId,
        }),
      );
    resolvedProjects.set(projectId, versionId);
    if (visited.has(versionId)) return;
    visited.add(versionId);
    const version = await client.getProjectVersion(versionId, task.signal);
    if (version.project_id !== projectId)
      throw new Error(tr('resources.theResourceAndVersionDoNotMatch'));
    const project = await client.getProject(projectId, task.signal);
    const category = categories[project.project_type];
    const file = version.files.find((entry) => entry.primary) || version.files[0];
    if (!file) throw new Error(tr('resources.thisResourceVersionHasNoDownloadableFile'));
    if (category === 'modpacks') {
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
    const targetInstance = instance;
    if (!compatible(version, targetInstance))
      throw new Error(
        tr('resources.versionValueIsIncompatibleWithThisInstance', {
          value1: version.version_number,
        }),
      );
    for (const dependency of version.dependencies.filter(
      (entry) => entry.dependency_type === 'required',
    )) {
      const required = dependency.version_id
        ? await client.getProjectVersion(dependency.version_id, task.signal)
        : dependency.project_id
          ? (
              await client.getProjectVersions(
                dependency.project_id,
                versionOptions(instance),
                task.signal,
              )
            )[0]
          : undefined;
      if (!required)
        throw new Error(
          tr('resources.cannotResolveRequiredDependencyValue', {
            value1: dependency.project_id || tr('resources.unknownDependency'),
          }),
        );
      await installVersion(required.project_id, required.id, true);
    }
    if (!category) throw new Error(tr('resources.unsupportedResourceType'));
    await installContentFile(host, targetInstance, task, {
      source: resourcesId,
      projectId,
      versionId,
      name: project.title,
      icon: project.icon_url ?? undefined,
      version: version.version_number,
      category,
      fileName: file.filename,
      url: file.url,
      hashes: file.hashes,
    });
  }
  await installVersion(projectId, versionId);
}
