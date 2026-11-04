import { lstat } from 'node:fs/promises';
import type { ContentUpdateTarget, InstalledContent, Instance } from '../../shared/contracts';
import type { NixelHost } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { checkedPath } from '../file-transaction';
import type { ResourceProvider } from '../providers';
import {
  type ContentDownload,
  contentDirectories,
  normalizeResourceSource,
} from '../resource-files';

export async function planContentUpdates(
  host: NixelHost,
  instance: Instance,
  updates: ContentUpdateTarget[],
  installed: InstalledContent[],
  signal: AbortSignal,
) {
  const files: ContentDownload[] = [];
  for (const source of new Set(updates.map((target) => target.source))) {
    signal.throwIfAborted();
    const provider = host.providers.get<ResourceProvider>('resources', source);
    if (!provider.planInstall)
      throw new Error(tr('contentUpdates.planningUnsupported', { source }));
    const targets = updates.filter((target) => target.source === source);
    const current = installed.filter((entry) => normalizeResourceSource(entry.source) === source);
    const roots = targets.map((target) => {
      const entry = current.find((entry) => entry.projectId === target.projectId);
      if (!entry) throw new Error(tr('content.updateTargetChanged'));
      return { projectId: target.projectId, versionId: target.versionId, enabled: entry.enabled };
    });
    const retained = current.filter(
      (entry) => !targets.some((target) => target.projectId === entry.projectId),
    );
    const resolved = await provider.planInstall(roots, instance, retained, signal, {
      pinRetained: false,
    });
    for (const root of roots)
      if (
        !resolved.some(
          (file) =>
            file.source === source &&
            file.projectId === root.projectId &&
            file.versionId === root.versionId,
        )
      )
        throw new Error(tr('contentUpdates.invalidPlan'));
    const projects = new Map<string, string>();
    for (const file of resolved) {
      if (
        file.source !== source ||
        !file.projectId ||
        !file.versionId ||
        !contentDirectories[file.category] ||
        /[\\/]/.test(file.fileName)
      )
        throw new Error(tr('contentUpdates.invalidPlan'));
      const previous = projects.get(file.projectId);
      if (previous && previous !== file.versionId)
        throw new Error(tr('optionalDependencies.conflict', { project: file.name }));
      if (previous) continue;
      projects.set(file.projectId, file.versionId);
      files.push(file);
    }
  }
  // Plan every source before checking destinations or writing any selected/dependency file.
  const destinations = new Set<string>();
  for (const file of files) {
    signal.throwIfAborted();
    const previous = installed.find(
      (entry) =>
        normalizeResourceSource(entry.source) === file.source && entry.projectId === file.projectId,
    );
    const fileName = previous?.enabled === false ? `${file.fileName}.disabled` : file.fileName;
    const path = `${contentDirectories[file.category]}/${fileName}`;
    const key = `${contentDirectories[file.category]}/${file.fileName}`.toLowerCase();
    if (destinations.has(key)) throw new Error(tr('contentUpdates.pathConflict', { path }));
    destinations.add(key);
    const collision = installed.find(
      (entry) =>
        entry.category === file.category &&
        entry.fileName.replace(/\.disabled$/, '').toLowerCase() === file.fileName.toLowerCase() &&
        !(
          normalizeResourceSource(entry.source) === file.source &&
          entry.projectId === file.projectId
        ),
    );
    if (collision) throw new Error(tr('contentUpdates.pathConflict', { path }));
    const destination = await checkedPath(instance.directory, path);
    const exists = await lstat(destination).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return false;
        throw error;
      },
    );
    if (exists && !(previous?.category === file.category && previous.fileName === fileName))
      throw new Error(tr('contentUpdates.pathConflict', { path }));
  }
  return files;
}
