import type { Context } from 'cordis';
import type { Account, Loader } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import { launchAccountId } from '../../shared/launch-account';
import { commandsFor } from '../commands';
import { assertInstanceIdle, getInstance } from '../instance-state';
import type { GameProvider } from '../providers';

export function registerInstanceLaunch(ctx: Context) {
  const host = ctx.nixel;
  const command = commandsFor(ctx);
  command('game.versions', () =>
    host.providers.get<GameProvider>('game', host.store.read().settings.providers.game).versions(),
  );
  command('game.loaders', ({ version, loader }: { version: string; loader: Loader }) =>
    host.providers
      .get<GameProvider>('game', host.store.read().settings.providers.game)
      .loaders(version, loader),
  );
  command('instances.launch', ({ id, accountId }: { id: string; accountId?: string }) => {
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
          await host.providers
            .get<GameProvider>('game', current.providers.game)
            .launch(current, currentAccount, task);
        },
        {
          instanceId: id,
          kind: 'launch',
          retry: { command: 'instances.launch', params: { id, accountId: account.id } },
        },
      ),
    };
  });
  command('instances.stop', ({ id }: { id: string }) =>
    host.providers.get<GameProvider>('game', getInstance(host, id).providers.game).stop(id),
  );
}
