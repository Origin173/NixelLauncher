import type { Context } from 'cordis';
import type { Account } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import { launchAccountId } from '../../shared/launch-account';
import { parseServerAddress } from '../../shared/servers';
import { commandsFor } from '../commands';
import { assertInstanceIdle, getInstance } from '../instance-state';
import type { GameProvider } from '../providers';

export function registerInstanceLaunch(ctx: Context) {
  const host = ctx.nixel;
  const command = commandsFor(ctx);
  command(
    'instances.launch',
    ({ id, accountId, server }: { id: string; accountId?: string; server?: string }) => {
      const target = server === undefined ? undefined : parseServerAddress(server);
      const instance = getInstance(host, id);
      assertInstanceIdle(host, id);
      if (instance.status !== 'ready') throw new Error(tr('game.installThisInstanceFirst'));
      const selected = launchAccountId(instance, host.store.read().settings, accountId);
      const account: Account | undefined = host.store
        .read()
        .accounts.find((item) => item.id === selected);
      if (!account) throw new Error(tr('game.addAndSelectAGameAccountFirst'));
      return {
        taskId: host.tasks.start(
          tr('game.runValue', { value1: instance.name }),
          tr('game.preparingToLaunch'),
          async (task) => {
            const current = getInstance(host, id);
            assertInstanceIdle(host, id, task.taskId);
            if (current.status !== 'ready') throw new Error(tr('game.installThisInstanceFirst'));
            const state = host.store.read();
            const currentAccount = state.accounts.find((entry) => entry.id === account.id);
            if (!currentAccount) throw new Error(tr('game.addAndSelectAGameAccountFirst'));
            await host.store.update((draft) => {
              draft.settings.launchInstance = id;
              draft.settings.launchAccount = currentAccount.id;
            });
            task.signal.throwIfAborted();
            if (
              target &&
              !host.providers
                .list()
                .some(
                  (provider) =>
                    provider.id === current.providers.game &&
                    provider.kind === 'game' &&
                    provider.capabilities?.includes('server-join'),
                )
            )
              throw new Error(tr('servers.unsupported'));
            await host.providers
              .get<GameProvider>('game', current.providers.game)
              .launch(current, currentAccount, task, { server: target });
          },
          {
            instanceId: id,
            kind: 'launch',
            retry: {
              command: 'instances.launch',
              params: { id, accountId: account.id, ...(target ? { server: target.address } : {}) },
            },
          },
        ),
      };
    },
  );
  command('instances.stop', ({ id }: { id: string }) =>
    host.providers.get<GameProvider>('game', getInstance(host, id).providers.game).stop(id),
  );
}
