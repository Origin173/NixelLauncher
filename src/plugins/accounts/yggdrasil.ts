import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Context } from 'cordis';
import type { Account, AccountProfile, YggdrasilLoginResult } from '../../shared/contracts';
import { tr, translatedName } from '../../shared/i18n';
import { commandsFor } from '../commands';
import { download, json } from '../files';
import { accountOperation } from './operations';
import { register, save, yggdrasilId } from './shared';
import { YggdrasilClient, type YggdrasilResponse, type YggdrasilTokens } from './yggdrasil-client';

interface PendingLogin {
  server: string;
  tokens: YggdrasilTokens;
  profiles: AccountProfile[];
  accountId?: string;
  expiresAt: number;
  controller: AbortController;
  selecting: boolean;
}
export const yggdrasilPlugin = {
  name: yggdrasilId,
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    const lifetime = new AbortController();
    const pending = new Map<string, PendingLogin>();
    ctx.effect(() => {
      const timer = setInterval(() => {
        for (const [id, entry] of pending) {
          if (entry.expiresAt >= Date.now()) continue;
          entry.controller.abort();
          pending.delete(id);
        }
      }, 60_000);
      return () => {
        clearInterval(timer);
        lifetime.abort();
        for (const entry of pending.values()) entry.controller.abort();
        pending.clear();
      };
    });
    const command = commandsFor(ctx);
    function existing(id: string) {
      const account = host.store
        .read()
        .accounts.find((entry) => entry.id === id && entry.provider === yggdrasilId);
      if (!account) throw new Error(tr('accounts.accountNotFound'));
      return account;
    }
    function assertSwitchIdle(accountId?: string) {
      if (
        accountId &&
        host.tasks
          .list()
          .some(
            (task) =>
              task.status === 'running' &&
              task.retry?.command === 'instances.launch' &&
              task.retry.params.accountId === accountId,
          )
      )
        throw new Error(tr('accountProfiles.inUse'));
    }
    async function credentials(account: Account) {
      const text = await host.platform.secretGet(`account:${account.id}`);
      if (!text) throw new Error(tr('accounts.thirdPartyCredentialsNotFoundSignIn'));
      return JSON.parse(text) as YggdrasilTokens;
    }
    async function complete(
      server: string,
      result: YggdrasilResponse,
      signal: AbortSignal,
      accountId?: string,
    ) {
      const profile = result.selectedProfile;
      if (!profile) throw new Error(tr('accounts.thisAccountHasNoAvailableGameProfile'));
      if (accountId) existing(accountId);
      const accounts = host.store.read().accounts;
      const matching = accounts.find(
        (entry) =>
          entry.provider === yggdrasilId &&
          entry.authServer === server &&
          entry.uuid === profile.id,
      );
      const generatedId = `${yggdrasilId}:${Buffer.from(server).toString('base64url')}:${profile.id}`;
      const id =
        accountId ||
        matching?.id ||
        (accounts.some((entry) => entry.id === generatedId)
          ? `${generatedId}:${randomUUID()}`
          : generatedId);
      return accountOperation(host, id, async () => {
        signal.throwIfAborted();
        if (accountId) existing(accountId);
        assertSwitchIdle(accountId);
        return persistProfile(server, result, id, signal);
      });
    }
    async function persistProfile(
      server: string,
      result: YggdrasilResponse,
      id: string,
      signal: AbortSignal,
    ) {
      const profile = result.selectedProfile;
      if (!profile) throw new Error(tr('accounts.thisAccountHasNoAvailableGameProfile'));
      if (
        host.store
          .read()
          .accounts.some((a) => a.id !== id && a.authServer === server && a.uuid === profile.id)
      )
        throw new Error(tr('accountProfiles.alreadyAdded'));
      signal.throwIfAborted();
      const previous = await host.platform.secretGet(`account:${id}`);
      signal.throwIfAborted();
      await host.platform.secretSet(
        `account:${id}`,
        JSON.stringify({ accessToken: result.accessToken, clientToken: result.clientToken }),
      );
      try {
        return await save(
          host,
          {
            id,
            uuid: profile.id,
            name: profile.name,
            authServer: server,
            provider: yggdrasilId,
            type: 'yggdrasil',
            color: 'purple',
            detail: new URL(server).hostname,
          },
          signal,
        );
      } catch (error) {
        if (previous == null) await host.platform.secretDelete(`account:${id}`);
        else await host.platform.secretSet(`account:${id}`, previous);
        throw error;
      }
    }
    async function refresh(account: Account, signal?: AbortSignal) {
      const combined = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
      return accountOperation(host, account.id, async () => {
        combined.throwIfAborted();
        account = existing(account.id);
        if (!account.authServer)
          throw new Error(tr('accounts.theThirdPartyAccountHasNoAuthentication'));
        const result = await new YggdrasilClient(account.authServer).refresh(
          await credentials(account),
          combined,
        );
        if (result.selectedProfile?.id !== account.uuid)
          throw new Error(tr('accountProfiles.profileChanged'));
        return persistProfile(account.authServer, result, account.id, combined);
      });
    }
    register(ctx, yggdrasilId, translatedName('accounts.yggdrasilAuthentication'), {
      refresh,
      async session(account, signal) {
        if (!account.authServer)
          throw new Error(tr('accounts.theThirdPartyAccountHasNoAuthentication'));
        const server = account.authServer;
        if (!(await new YggdrasilClient(server).validate(await credentials(account), signal)))
          account = await refresh(account, signal);
        const secret = await credentials(account);
        const metadata = await json<{ download_url: string; checksums: Record<string, string> }>(
          'https://authlib-injector.yushi.moe/artifact/latest.json',
          { signal },
        );
        const jar = join(host.store.cacheRoot, 'authlib-injector.jar');
        await download(metadata.download_url, jar, signal, metadata.checksums);
        return {
          accessToken: secret.accessToken,
          gameProfile: { id: account.uuid, name: account.name },
          userType: 'mojang',
          yggdrasilAgent: { jar, server },
        };
      },
    });
    command(
      'accounts.yggdrasil.login',
      async ({
        server,
        username,
        password,
        accountId,
      }: {
        server: string;
        username: string;
        password: string;
        accountId?: string;
      }): Promise<YggdrasilLoginResult> => {
        const url = new URL(server);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
          throw new Error(tr('accounts.theAuthenticationServerMustUseHttps'));
        server = url.href.replace(/\/$/, '');
        if (accountId && existing(accountId).authServer !== server)
          throw new Error(tr('accountProfiles.serverChanged'));
        assertSwitchIdle(accountId);
        const result = await new YggdrasilClient(server).login(
          {
            username,
            password,
            clientToken: randomUUID().replaceAll('-', ''),
          },
          lifetime.signal,
        );
        lifetime.signal.throwIfAborted();
        assertSwitchIdle(accountId);
        if (result.selectedProfile)
          return {
            status: 'complete',
            account: await complete(server, result, lifetime.signal, accountId),
          };
        if (!result.availableProfiles?.length)
          throw new Error(tr('accounts.thisAccountHasNoAvailableGameProfile'));
        for (const [id, entry] of pending) {
          if (entry.expiresAt >= Date.now()) continue;
          entry.controller.abort();
          pending.delete(id);
        }
        const id = randomUUID();
        pending.set(id, {
          server,
          tokens: { accessToken: result.accessToken, clientToken: result.clientToken },
          profiles: result.availableProfiles,
          accountId,
          expiresAt: Date.now() + 10 * 60 * 1000,
          controller: new AbortController(),
          selecting: false,
        });
        return { status: 'select-profile', id, profiles: result.availableProfiles };
      },
    );
    command(
      'accounts.yggdrasil.selectProfile',
      async ({ id, profileId }: { id: string; profileId: string }): Promise<Account> => {
        const login = pending.get(id);
        if (!login || login.expiresAt < Date.now()) {
          login?.controller.abort();
          pending.delete(id);
          throw new Error(tr('accountProfiles.expired'));
        }
        const profile = login.profiles.find((entry) => entry.id === profileId);
        if (!profile) throw new Error(tr('accountProfiles.invalidProfile'));
        assertSwitchIdle(login.accountId);
        if (login.selecting) throw new Error(tr('accountProfiles.expired'));
        login.selecting = true;
        const signal = AbortSignal.any([login.controller.signal, lifetime.signal]);
        try {
          const result = await new YggdrasilClient(login.server).refresh(
            login.tokens,
            signal,
            profile,
          );
          if (result.selectedProfile?.id !== profile.id)
            throw new Error(tr('accountProfiles.profileChanged'));
          assertSwitchIdle(login.accountId);
          return await complete(login.server, result, signal, login.accountId);
        } finally {
          pending.delete(id);
        }
      },
    );
    command('accounts.yggdrasil.cancel', ({ id }: { id: string }) => {
      pending.get(id)?.controller.abort();
      pending.delete(id);
    });
  },
};
