import type { Context } from 'cordis';
import { tr } from '../../shared/i18n';
import { commandsFor } from '../commands';
import type { AccountProvider } from '../providers';
import { accountOperation } from './operations';

export { microsoftPlugin } from './microsoft';
export { offlinePlugin } from './offline';
export { microsoftId, offlineId, yggdrasilId } from './shared';
export { yggdrasilPlugin } from './yggdrasil';
export const accountsPlugin = {
  name: 'nixel.accounts',
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    const command = commandsFor(ctx);
    command('accounts.remove', ({ id }: { id: string }) =>
      accountOperation(host, id, async () => {
        const previous = await host.platform.secretGet(`account:${id}`);
        await host.platform.secretDelete(`account:${id}`);
        try {
          await host.store.update((draft) => {
            draft.accounts = draft.accounts.filter((entry) => entry.id !== id);
            if (draft.settings.defaultAccount === id)
              draft.settings.defaultAccount = draft.accounts[0]?.id || '';
            if (draft.settings.launchAccount === id) draft.settings.launchAccount = '';
            for (const instance of draft.instances) {
              if (instance.account === id) instance.account = '';
            }
          });
        } catch (error) {
          if (previous != null) await host.platform.secretSet(`account:${id}`, previous);
          throw error;
        }
      }),
    );
    command('accounts.refresh', async ({ id }: { id: string }) => {
      const account = host.store.read().accounts.find((entry) => entry.id === id);
      if (!account) throw new Error(tr('accounts.accountNotFound'));
      return host.providers.get<AccountProvider>('accounts', account.provider).refresh(account);
    });
  },
};
