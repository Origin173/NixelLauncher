import type { Instance } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import type { ContentNode, ContentResolver } from '../resource-dependencies';
import type { CurseForgeClient } from './client';
import { assertDownload, curseforgeId, fileHashes, id, isCompatible } from './rules';

export function contentResolver(
  client: CurseForgeClient,
  instance: Instance,
  signal?: AbortSignal,
): ContentResolver {
  const pending = new Map<string, Promise<ContentNode>>();
  async function resolve(projectId?: string, versionId?: string): Promise<ContentNode> {
    signal?.throwIfAborted();
    if (!projectId) throw new Error(tr('optionalDependencies.noCompatibleVersion'));
    const projectNumber = id(projectId);
    const [project, file, classes] = await Promise.all([
      client.project(projectNumber, signal),
      versionId
        ? client.file(projectNumber, id(versionId), signal)
        : client.versions(projectNumber, instance, signal).then((files) => files[0]),
      client.categoryIds(signal),
    ]);
    if (!file) throw new Error(tr('optionalDependencies.noCompatibleVersion'));
    assertDownload(project, file);
    const category = classes.get(project.classId);
    if (!category || category === 'modpacks')
      throw new Error(tr('curseforge.aCurseforgeModpackManifestOrDependencyCannot'));
    if (!isCompatible(file, instance, category))
      throw new Error(
        tr('curseforge.curseforgeFileValueIsIncompatibleWithThis', {
          value1: file.displayName,
        }),
      );
    return {
      file: {
        source: curseforgeId,
        projectId,
        versionId: String(file.id),
        name: project.name,
        icon: project.logo?.thumbnailUrl,
        version: file.displayName,
        category,
        fileName: file.fileName,
        url: file.downloadUrl as string,
        hashes: fileHashes(file),
      },
      dependencies: file.dependencies.map((dependency) => ({
        projectId: String(dependency.modId),
        type:
          ({ 2: 'optional', 3: 'required', 5: 'incompatible' } as Record<number, string>)[
            dependency.relationType
          ] ?? 'embedded',
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
