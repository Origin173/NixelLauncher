import { isAbsolute } from 'node:path';
import type { Context } from 'cordis';
import { tr } from '../../shared/i18n';
import { commandsFor } from '../commands';
import { getInstance } from '../instance-state';
import { collectDiagnostics } from './collect';
import { exportDiagnostics } from './export';

export const diagnosticsPlugin = {
  name: 'nixel.diagnostics',
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    const command = commandsFor(ctx);
    command('diagnostics.analyze', ({ id }: { id: string }) => collectDiagnostics(host, id));
    command('diagnostics.export', ({ id, path }: { id: string; path: string }) => {
      getInstance(host, id);
      if (typeof path !== 'string' || !isAbsolute(path) || !path.toLowerCase().endsWith('.zip'))
        throw new Error(tr('diagnostics.invalidTarget'));
      return {
        taskId: host.tasks.start(
          tr('diagnostics.export'),
          tr('diagnostics.collecting'),
          (task) => exportDiagnostics(host, id, path, task),
          {
            instanceId: id,
            kind: 'diagnostics',
            retry: { command: 'diagnostics.export', params: { id, path } },
          },
        ),
      };
    });
  },
};
