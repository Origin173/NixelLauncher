import type { Context } from 'cordis';
import { tr } from '../../shared/i18n';
import { assertInstanceIdle } from '../instance-state';
import type { BackupRepository } from '../instances/backups/repository';
import { registerUpgrade } from './commands';
import { exportModpack } from './export';
import { importModpack } from './import';

export { importModpack } from './import';
export function registerModpacks(ctx: Context, backups: BackupRepository) {
  const host = ctx.nixel;
  registerUpgrade(ctx, backups);
  host.commands.register(
    ctx,
    'instances.import',
    ({ path, name }: { path: string; name?: string }) => ({
      taskId: host.tasks.start(
        tr('modpacks.importModpack'),
        tr('modpacks.readingTheModpackManifest'),
        async (task) => {
          await importModpack(host, path, task, name);
        },
        { kind: 'import', retry: { command: 'instances.import', params: { path, name } } },
      ),
    }),
  );
  host.commands.register(ctx, 'instances.export', ({ id, path }: { id: string; path: string }) => {
    assertInstanceIdle(host, id);
    return {
      taskId: host.tasks.start(
        tr('modpacks.exportModpack'),
        tr('modpacks.packingTheInstanceAndSaves'),
        (task) => exportModpack(host, id, path, task),
        {
          instanceId: id,
          kind: 'export',
          retry: { command: 'instances.export', params: { id, path } },
        },
      ),
    };
  });
}
