import type { Context } from 'cordis';
import { appUpdatesId } from '../../shared/app-updates';
import { tr } from '../../shared/i18n';
import { commandsFor } from '../commands';
import { runUpdate } from './operations';

export const appUpdatesPlugin = {
  name: appUpdatesId,
  inject: ['nixel'],
  apply(ctx: Context, config: Record<string, unknown>) {
    if (config.autoCheck !== undefined && typeof config.autoCheck !== 'boolean')
      throw new Error(tr('appUpdates.invalidPreference'));
    const host = ctx.nixel;
    const command = commandsFor(ctx);
    let releaseInstall: (() => void) | undefined;
    let stopped = false;
    ctx.effect(() => () => {
      stopped = true;
      releaseInstall?.();
      return host.platform.appUpdates('cancel').then(() => {});
    });
    command('appUpdates.status', () => host.platform.appUpdates('status'));
    command('appUpdates.configure', (input: { autoCheck: boolean }) => {
      if (typeof input?.autoCheck !== 'boolean')
        throw new Error(tr('appUpdates.invalidPreference'));
      return host.commands.invoke('plugins.configure', {
        id: appUpdatesId,
        config: { autoCheck: input.autoCheck },
      });
    });
    for (const action of ['check', 'download'] as const)
      command(`appUpdates.${action}`, () => ({
        taskId: host.tasks.start(
          tr(`appUpdates.${action}`),
          tr('appUpdates.title'),
          (task) => runUpdate(host, task, action),
          { kind: 'application-update' },
        ),
      }));
    command(
      'appUpdates.install',
      () =>
        new Promise((resolve, reject) => {
          void host.tasks
            .whileIdle(async () => {
              if (host.running.size) throw new Error(tr('appUpdates.installBusy'));
              const disposed = new Promise<void>((release) => {
                releaseInstall = release;
              });
              try {
                const result = await host.platform.appUpdates('install');
                // Reply before shutdown; the idle lock itself remains held until scope disposal.
                resolve(result);
                await disposed;
              } finally {
                releaseInstall = undefined;
              }
            })
            .catch(reject);
        }),
    );
    if (config.autoCheck) {
      const timer = setTimeout(() => {
        void host.platform
          .appUpdates('status')
          .then((state) => {
            if (!stopped && state.availability === 'ready' && !state.checkedAt)
              return host.commands.invoke('appUpdates.check');
          })
          .catch(() => console.warn(tr('appUpdates.autoCheckFailed')));
      }, 1000);
      ctx.effect(() => () => clearTimeout(timer));
    }
  },
};
