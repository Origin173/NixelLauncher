import type { NixelHost, TaskContext } from '../../../shared/host-api';
import { tr } from '../../../shared/i18n';
import type { BackupRepository } from './repository';

/** Only a committed automatic backup can trigger the configured per-instance cleanup. */
export async function pruneBackups(
  host: NixelHost,
  repository: BackupRepository,
  instanceId: string,
  createdId: string,
  task: TaskContext,
) {
  const count = host.store.read().settings.backupRetentionCount;
  if (count === 0) return;
  try {
    const backups = (await repository.list(instanceId)).filter(
      (backup) =>
        (backup.origin === 'version-change' || backup.origin === 'modpack-upgrade') &&
        backup.id !== createdId,
    );
    for (const backup of backups.slice(count - 1)) {
      if (task.signal.aborted) return;
      if (
        repository.deleting.has(backup.id) ||
        host.tasks
          .list()
          .some(
            (entry) =>
              entry.kind === 'restore' &&
              entry.resourceId === backup.id &&
              entry.status === 'running',
          )
      ) {
        task.log(tr('backupRetention.skipped', { id: backup.id }));
        continue;
      }
      await repository.remove(backup.id);
      task.log(tr('backupRetention.removed', { id: backup.id }));
    }
  } catch (error) {
    // The new archive is already committed; cleanup failure must not invalidate it.
    task.log(
      tr('backupRetention.failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
