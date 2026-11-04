import type { Context } from 'cordis';
import { tr, translatedName } from '../../shared/i18n';
import { offlineUUID } from '../authentication';
import { commandsFor } from '../commands';
import { offlineId, register, save } from './shared';
export const offlinePlugin = {
  name: offlineId,
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    register(ctx, offlineId, translatedName('accounts.offlineProfile'), {
      async refresh(account) {
        return account;
      },
      async session(account) {
        return {
          gameProfile: { id: account.uuid, name: account.name },
          accessToken: '0',
          userType: 'legacy',
        };
      },
    });
    const command = commandsFor(ctx);
    command('accounts.addOffline', async ({ name }: { name: string }) => {
      name = name.trim();
      if (!/^[a-zA-Z0-9_]{1,16}$/.test(name))
        throw new Error(tr('accounts.offlineNamesMustContain116Letters'));
      const uuid = offlineUUID(name);
      return save(host, {
        id: `${offlineId}:${uuid}`,
        name,
        uuid,
        type: 'offline',
        provider: offlineId,
        color: 'green',
        detail: tr('accounts.offlineProfileNoOnlineAuthentication'),
      });
    });
  },
};
