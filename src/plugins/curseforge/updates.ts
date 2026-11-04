import { join } from 'node:path';
import type { Instance } from '../../shared/contracts';
import type { NixelHost, TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { hashFile } from '../files';
import { contentDirectories, normalizeResourceSource } from '../resource-files';
import type { CurseForgeClient } from './client';
import { curseforgeId, fileHashes, id } from './rules';
export async function checkUpdates(
  host: NixelHost,
  client: CurseForgeClient,
  instance: Instance,
  task: TaskContext,
) {
  const entries = host.store
    .read()
    .content.filter(
      (entry) =>
        entry.instance === instance.id &&
        normalizeResourceSource(entry.source) === curseforgeId &&
        entry.projectId &&
        entry.versionId,
    );
  const errors: Error[] = [];
  for (const [index, entry] of entries.entries()) {
    task.signal.throwIfAborted();
    task.report((index / entries.length) * 100, tr('content.checkingFile', { name: entry.name }));
    try {
      const projectId = id(entry.projectId as string);
      const latest = (await client.versions(projectId, instance, task.signal))[0];
      const current = await client.file(projectId, id(entry.versionId as string), task.signal);
      const hashes = fileHashes(current);
      const algorithm = hashes.sha1 ? 'sha1' : 'md5';
      const checksum = await hashFile(
        join(instance.directory, contentDirectories[entry.category], entry.fileName),
        algorithm,
        task.signal,
      );
      if (checksum !== hashes[algorithm])
        throw new Error(
          tr('curseforge.localFileValueWasModifiedReviewIt', { value1: entry.fileName }),
        );
      await host.store.update((draft) => {
        const item = draft.content.find((content) => content.id === entry.id);
        if (item)
          item.update =
            latest &&
            latest.id !== current.id &&
            Date.parse(latest.fileDate) > Date.parse(current.fileDate)
              ? { versionId: String(latest.id), version: latest.displayName }
              : undefined;
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
