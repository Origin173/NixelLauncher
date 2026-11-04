import { join } from 'node:path';
import type { Instance } from '../../shared/contracts';
import type { NixelHost, TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { hashFile, inside } from '../files';
import { contentDirectories, normalizeResourceSource } from '../resource-files';
import type { ModrinthClient } from './client';
import { resourcesId, versionOptions } from './rules';
export async function checkUpdates(
  host: NixelHost,
  client: ModrinthClient,
  instance: Instance,
  task: TaskContext,
) {
  const entries = host.store
    .read()
    .content.filter(
      (entry) =>
        entry.instance === instance.id &&
        (!entry.source || normalizeResourceSource(entry.source) === resourcesId),
    );
  const errors: Error[] = [];
  for (const [index, entry] of entries.entries()) {
    task.signal.throwIfAborted();
    task.report((index / entries.length) * 100, tr('content.checkingFile', { name: entry.name }));
    try {
      const path = inside(
        join(instance.directory, contentDirectories[entry.category]),
        entry.fileName,
      );
      const hash = await hashFile(path, 'sha512', task.signal);
      const versions = await client.getLatestVersionsFromHashes(
        [hash],
        {
          algorithm: 'sha512',
          ...versionOptions(instance),
        },
        task.signal,
      );
      const latest = versions[hash];
      if (!latest) continue;
      const current = await client.getProjectVersionByHash(
        hash,
        { algorithm: 'sha512' },
        task.signal,
      );
      if (entry.projectId && entry.projectId !== current.project_id)
        throw new Error(tr('content.fileIdentityChanged', { name: entry.name }));
      const project =
        !entry.projectId || !entry.icon
          ? await client.getProject(current.project_id, task.signal)
          : undefined;
      await host.store.update((draft) => {
        const item = draft.content.find((content) => content.id === entry.id);
        if (item) {
          item.projectId = current.project_id;
          item.versionId = current.id;
          item.version = current.version_number;
          item.source = resourcesId;
          if (project) {
            item.name = project.title;
            item.icon = project.icon_url ?? undefined;
          }
          item.update =
            current.id !== latest.id &&
            Date.parse(latest.date_published) > Date.parse(current.date_published)
              ? { versionId: latest.id, version: latest.version_number }
              : undefined;
        }
      });
    } catch (error) {
      task.signal.throwIfAborted();
      const failure = new Error(
        tr('content.fileCheckFailed', {
          name: entry.name,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      errors.push(failure);
      task.log(failure.message);
    }
  }
  task.report(100);
  if (errors.length) throw new AggregateError(errors, tr('content.checkIncomplete'));
}
