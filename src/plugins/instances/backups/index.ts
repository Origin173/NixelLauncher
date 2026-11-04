import type { Context } from 'cordis';
import { tr } from '../../../shared/i18n';
import { commandsFor } from '../../commands';
import { assertInstanceIdle, getInstance } from '../../instance-state';
import { createBackup, restoreBackup } from './operations';
import type { BackupRepository } from './repository';

export function registerBackups(ctx: Context, repository: BackupRepository) {
  const host = ctx.nixel;
  const command = commandsFor(ctx);
  command('backups.list', (params?: { instanceId?: string }) =>
    repository.list(params?.instanceId),
  );
  command('backups.create', ({ instanceId }: { instanceId: string }) => {
    assertInstanceIdle(host, instanceId);
    const instance = getInstance(host, instanceId);
    return {
      taskId: host.tasks.start(
        tr('backups.createTask', { name: instance.name }),
        tr('backups.preparing'),
        async (task) => {
          await createBackup(host, repository, instanceId, task);
        },
        {
          instanceId,
          kind: 'backup',
          retry: { command: 'backups.create', params: { instanceId } },
        },
      ),
    };
  });
  command('backups.restore', ({ id }: { id: string }) => {
    if (repository.deleting.has(id)) throw new Error(tr('backups.deleting'));
    return {
      taskId: host.tasks.start(
        tr('backups.restoreTask'),
        tr('backups.preparing'),
        (task) => restoreBackup(host, repository, id, task),
        { kind: 'restore', resourceId: id, retry: { command: 'backups.restore', params: { id } } },
      ),
    };
  });
  command('backups.delete', async ({ id }: { id: string }) => {
    if (
      host.tasks
        .list()
        .some(
          (task) => task.kind === 'restore' && task.resourceId === id && task.status === 'running',
        )
    )
      throw new Error(tr('backups.restoring'));
    await repository.remove(id);
  });
}
