import type { Instance } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import type { ContentNode, ContentResolver } from '../resource-dependencies';
import type { ModrinthClient } from './client';
import { categories, compatible, resourcesId, versionOptions } from './rules';

export function contentResolver(
  client: ModrinthClient,
  instance: Instance,
  signal?: AbortSignal,
): ContentResolver {
  const pending = new Map<string, Promise<ContentNode>>();
  async function resolve(projectId?: string, versionId?: string): Promise<ContentNode> {
    signal?.throwIfAborted();
    const version = versionId
      ? await client.getProjectVersion(versionId, signal)
      : projectId
        ? (await client.getProjectVersions(projectId, versionOptions(instance), signal))[0]
        : undefined;
    if (!version) throw new Error(tr('optionalDependencies.noCompatibleVersion'));
    if (projectId && version.project_id !== projectId)
      throw new Error(tr('resources.theResourceAndVersionDoNotMatch'));
    if (!compatible(version, instance))
      throw new Error(
        tr('resources.versionValueIsIncompatibleWithThisInstance', {
          value1: version.version_number,
        }),
      );
    const project = await client.getProject(version.project_id, signal);
    const category = categories[project.project_type];
    if (!category || category === 'modpacks')
      throw new Error(tr('resources.unsupportedResourceType'));
    const file = version.files.find((entry) => entry.primary) || version.files[0];
    if (!file) throw new Error(tr('resources.thisResourceVersionHasNoDownloadableFile'));
    return {
      file: {
        source: resourcesId,
        projectId: version.project_id,
        versionId: version.id,
        name: project.title,
        icon: project.icon_url ?? undefined,
        version: version.version_number,
        category,
        fileName: file.filename,
        url: file.url,
        hashes: file.hashes,
      },
      dependencies: version.dependencies.map((dependency) => ({
        projectId: dependency.project_id ?? undefined,
        versionId: dependency.version_id ?? undefined,
        type: dependency.dependency_type,
        name: dependency.file_name ?? undefined,
      })),
    };
  }
  return (projectId, versionId) => {
    const key = JSON.stringify([projectId, versionId]);
    let result = pending.get(key);
    if (!result) {
      result = resolve(projectId, versionId);
      pending.set(key, result);
    }
    return result;
  };
}
