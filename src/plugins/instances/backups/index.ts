import type { Context } from 'cordis';
import { tr } from '../../../shared/i18n';
import { commandsFor } from '../../commands';
import { assertInstanceIdle, getInstance } from '../../instance-state';
import { createBackup, restoreBackup } from './operations';
import { BackupRepository } from './repository';

export async function registerBackups(ctx: Context) {
  const host = ctx.nixel;
  const repository = new BackupRepository(host.store.root);
  await repository.initialize();
  const command = commandsFor(ctx);
  const deleting = new Set<string>();
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
        (task) => createBackup(host, repository, instanceId, task),
        {
          instanceId,
          kind: 'backup',
          retry: { command: 'backups.create', params: { instanceId } },
        },
      ),
    };
  });
  command('backups.restore', ({ id }: { id: string }) => {
    if (deleting.has(id)) throw new Error(tr('backups.deleting'));
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
    if (deleting.has(id)) throw new Error(tr('backups.deleting'));
    deleting.add(id);
    try {
      await repository.remove(id);
    } finally {
      deleting.delete(id);
    }
  });
}
