import type { Context } from 'cordis';
import type { Account, ProviderDescriptor } from '../../shared/contracts';
import type { NixelHost } from '../../shared/host-api';
import type { AccountProvider } from '../providers';
export const offlineId = 'nixel.accounts.offline';
export const microsoftId = 'nixel.accounts.microsoft';
export const yggdrasilId = 'nixel.accounts.yggdrasil';
export async function save(host: NixelHost, account: Account) {
  await host.store.update((draft) => {
    const index = draft.accounts.findIndex((entry) => entry.id === account.id);
    if (index < 0) draft.accounts.push(account);
    else draft.accounts[index] = account;
    if (!draft.settings.defaultAccount) draft.settings.defaultAccount = account.id;
  });
  return account;
}
export function register(
  ctx: Context,
  id: string,
  display: Pick<ProviderDescriptor, 'name' | 'locales'>,
  implementation: AccountProvider,
) {
  ctx.nixel.providers.register(
    ctx,
    {
      id,
      pluginId: id,
      kind: 'accounts',
      ...display,
      capabilities: implementation.appearance ? ['appearance'] : [],
    },
    implementation,
  );
}
