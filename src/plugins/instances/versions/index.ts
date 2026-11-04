import type { Context } from 'cordis';
import type { ChangeInstanceVersionInput, InstanceVersionTarget } from '../../../shared/contracts';
import { tr } from '../../../shared/i18n';
import { commandsFor } from '../../commands';
import { assertInstanceIdle, getInstance } from '../../instance-state';
import type { BackupRepository } from '../backups/repository';
import { registerVersionCatalog } from './catalog';
import { changeVersion } from './change';
import { planVersionChange } from './plan';

export function registerVersionManagement(ctx: Context, backups: BackupRepository) {
  registerVersionCatalog(ctx);
  const host = ctx.nixel;
  const command = commandsFor(ctx);
  command(
    'instances.planVersionChange',
    ({ id, target }: { id: string; target: InstanceVersionTarget }) =>
      planVersionChange(host, id, target),
  );
  command('instances.changeVersion', (input: ChangeInstanceVersionInput) => {
    assertInstanceIdle(host, input.id);
    const instance = getInstance(host, input.id);
    return {
      taskId: host.tasks.start(
        tr('versionChange.task', { name: instance.name }),
        tr('versionChange.checking'),
        (task) => changeVersion(host, backups, input, task),
        {
          instanceId: input.id,
          kind: 'version-change',
          retry: { command: 'instances.changeVersion', params: { ...input } },
        },
      ),
    };
  });
}
