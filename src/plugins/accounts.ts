import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { getOfflineUUID, MicrosoftAuthenticator, YggdrasilThirdPartyClient } from '@xmcl/user';
import type { Context } from 'cordis';
import { serviceEnvironment } from '../host/service-environment';
import type { Account, DeviceLogin } from '../shared/contracts';
import type { NixelHost } from '../shared/host-api';
import { commandsFor } from './commands';
import { download, json } from './files';
import type { AccountProvider } from './providers';

export const offlineId = 'nixel.accounts.offline';
export const microsoftId = 'nixel.accounts.microsoft';
export const yggdrasilId = 'nixel.accounts.yggdrasil';
async function save(host: NixelHost, account: Account) {
  await host.store.update((draft) => {
    const index = draft.accounts.findIndex((entry) => entry.id === account.id);
    if (index < 0) draft.accounts.push(account);
    else draft.accounts[index] = account;
    if (!draft.settings.defaultAccount) draft.settings.defaultAccount = account.id;
  });
  return account;
}
function register(ctx: Context, id: string, name: string, implementation: AccountProvider) {
  ctx.nixel.providers.register(ctx, { id, pluginId: id, kind: 'accounts', name }, implementation);
}
export const offlinePlugin = {
  name: offlineId,
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    register(ctx, offlineId, '离线角色', {
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
        throw new Error('离线角色名应为 1–16 位字母、数字或下划线');
      const uuid = getOfflineUUID(name).replaceAll('-', '');
      return save(host, {
        id: `${offlineId}:${uuid}`,
        name,
        uuid,
        type: '离线',
        provider: offlineId,
        color: 'green',
        detail: '离线角色 · 无在线验证',
      });
    });
  },
};

interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}
interface MicrosoftSecret {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  clientId: string;
}
const oauth = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const scope = 'XboxLive.signin offline_access';

export const microsoftPlugin = {
  name: microsoftId,
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    const pending = new Map<
      string,
      {
        deviceCode: string;
        clientId: string;
        expiresAt: number;
        nextPoll: number;
        interval: number;
      }
    >();
    const authenticator = new MicrosoftAuthenticator();
    async function complete(tokens: OAuthTokens, clientId: string) {
      const { minecraftXstsResponse: xbox } = await authenticator.acquireXBoxToken(
        tokens.access_token,
      );
      const minecraft = await authenticator.loginMinecraftWithXBox(
        xbox.DisplayClaims.xui[0].uhs,
        xbox.Token,
      );
      const profile = await json<{ id: string; name: string }>(
        'https://api.minecraftservices.com/minecraft/profile',
        { headers: { Authorization: `Bearer ${minecraft.access_token}` } },
      );
      const id = `${microsoftId}:${profile.id}`;
      const expiresAt = Date.now() + minecraft.expires_in * 1000;
      const secret: MicrosoftSecret = {
        refreshToken: tokens.refresh_token,
        accessToken: minecraft.access_token,
        expiresAt,
        clientId,
      };
      await host.platform.secretSet(`account:${id}`, JSON.stringify(secret));
      return save(host, {
        id,
        name: profile.name,
        uuid: profile.id,
        type: 'Microsoft',
        provider: microsoftId,
        color: 'blue',
        detail: 'Minecraft Java · Microsoft',
        expiresAt,
      });
    }
    async function refresh(account: Account) {
      const text = await host.platform.secretGet(`account:${account.id}`);
      if (!text) throw new Error('登录凭据不存在，请重新登录 Microsoft');
      const secret = JSON.parse(text) as MicrosoftSecret;
      const response = await fetch(`${oauth}/token`, {
        method: 'POST',
        body: new URLSearchParams({
          client_id: secret.clientId,
          grant_type: 'refresh_token',
          refresh_token: secret.refreshToken,
          scope,
        }),
      });
      if (!response.ok) throw new Error('Microsoft 会话刷新失败，请重新登录');
      const tokens = (await response.json()) as OAuthTokens;
      return complete(
        { ...tokens, refresh_token: tokens.refresh_token || secret.refreshToken },
        secret.clientId,
      );
    }
    register(ctx, microsoftId, 'Microsoft', {
      refresh,
      async session(account, signal) {
        if (!account.expiresAt || account.expiresAt < Date.now() + 60000)
          account = await refresh(account);
        signal.throwIfAborted();
        const text = await host.platform.secretGet(`account:${account.id}`);
        if (!text) throw new Error('Microsoft 登录凭据不存在');
        return {
          accessToken: (JSON.parse(text) as MicrosoftSecret).accessToken,
          gameProfile: { id: account.uuid, name: account.name },
          userType: 'mojang',
        };
      },
    });
    const command = commandsFor(ctx);
    command('accounts.microsoft.start', async (): Promise<DeviceLogin> => {
      const clientId = serviceEnvironment.microsoftClientId;
      if (!clientId)
        throw new Error(
          '请在 .env 配置 MICROSOFT_CLIENT_ID 并重启启动器。该应用需启用设备代码流程与 Minecraft 服务访问权限。',
        );
      const response = await fetch(`${oauth}/devicecode`, {
        method: 'POST',
        body: new URLSearchParams({ client_id: clientId, scope }),
      });
      if (!response.ok)
        throw new Error(
          `无法开始 Microsoft 登录：HTTP ${response.status}，请检查客户端 ID 与应用权限`,
        );
      const code = (await response.json()) as {
        device_code: string;
        user_code: string;
        verification_uri: string;
        expires_in: number;
        interval: number;
      };
      const id = randomUUID();
      const expiresAt = Date.now() + code.expires_in * 1000;
      pending.set(id, {
        deviceCode: code.device_code,
        clientId,
        expiresAt,
        nextPoll: 0,
        interval: code.interval || 5,
      });
      return {
        id,
        userCode: code.user_code,
        verificationUri: code.verification_uri,
        expiresAt,
        interval: code.interval || 5,
      };
    });
    command('accounts.microsoft.poll', async ({ id }: { id: string }) => {
      const login = pending.get(id);
      if (!login || Date.now() >= login.expiresAt) {
        pending.delete(id);
        throw new Error('设备代码已过期，请重新登录');
      }
      if (Date.now() < login.nextPoll) return { status: 'pending' };
      login.nextPoll = Date.now() + login.interval * 1000;
      const response = await fetch(`${oauth}/token`, {
        method: 'POST',
        body: new URLSearchParams({
          client_id: login.clientId,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: login.deviceCode,
        }),
      });
      const body = (await response.json()) as OAuthTokens & { error?: string };
      if (body.error === 'authorization_pending') return { status: 'pending' };
      if (body.error === 'slow_down') {
        login.interval += 5;
        login.nextPoll = Date.now() + login.interval * 1000;
        return { status: 'pending' };
      }
      pending.delete(id);
      if (!response.ok) throw new Error(`Microsoft 登录失败：${body.error || response.status}`);
      return { status: 'complete', account: await complete(body, login.clientId) };
    });
    ctx.effect(() => () => {
      pending.clear();
    });
  },
};

interface YggdrasilSecret {
  accessToken: string;
  clientToken: string;
}
export const yggdrasilPlugin = {
  name: yggdrasilId,
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    const client = (server: string) => new YggdrasilThirdPartyClient(server);
    async function refresh(account: Account) {
      if (!account.authServer) throw new Error('第三方账号缺少认证地址');
      const text = await host.platform.secretGet(`account:${account.id}`);
      if (!text) throw new Error('第三方账号凭据不存在，请重新登录');
      const result = await client(account.authServer).refresh(JSON.parse(text) as YggdrasilSecret);
      await host.platform.secretSet(
        `account:${account.id}`,
        JSON.stringify({ accessToken: result.accessToken, clientToken: result.clientToken }),
      );
      return save(host, {
        ...account,
        name: result.selectedProfile.name,
        uuid: result.selectedProfile.id,
      });
    }
    register(ctx, yggdrasilId, 'Yggdrasil 第三方认证', {
      refresh,
      async session(account, signal) {
        account = await refresh(account);
        const secret = JSON.parse(
          (await host.platform.secretGet(`account:${account.id}`)) || '{}',
        ) as YggdrasilSecret;
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
          yggdrasilAgent: { jar, server: account.authServer || '' },
        };
      },
    });
    host.commands.register(
      ctx,
      'accounts.yggdrasil.login',
      async ({
        server,
        username,
        password,
      }: {
        server: string;
        username: string;
        password: string;
      }) => {
        const url = new URL(server);
        if (url.protocol !== 'https:') throw new Error('认证服务器必须使用 HTTPS');
        server = url.href.replace(/\/$/, '');
        const result = await client(server).login({
          username,
          password,
          clientToken: randomUUID(),
        });
        if (!result.selectedProfile) throw new Error('此账号没有可用的游戏角色');
        const id = `${yggdrasilId}:${Buffer.from(server).toString('base64url')}:${result.selectedProfile.id}`;
        await host.platform.secretSet(
          `account:${id}`,
          JSON.stringify({ accessToken: result.accessToken, clientToken: result.clientToken }),
        );
        return save(host, {
          id,
          uuid: result.selectedProfile.id,
          name: result.selectedProfile.name,
          authServer: server,
          provider: yggdrasilId,
          type: '第三方',
          color: 'purple',
          detail: url.hostname,
        });
      },
    );
  },
};

export const accountsPlugin = {
  name: 'nixel.accounts',
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    const command = commandsFor(ctx);
    command('accounts.remove', async ({ id }: { id: string }) => {
      await host.platform.secretDelete(`account:${id}`);
      await host.store.update((draft) => {
        draft.accounts = draft.accounts.filter((entry) => entry.id !== id);
        if (draft.settings.defaultAccount === id)
          draft.settings.defaultAccount = draft.accounts[0]?.id || '';
        if (draft.settings.launchAccount === id) draft.settings.launchAccount = '';
      });
    });
    command('accounts.refresh', async ({ id }: { id: string }) => {
      const account = host.store.read().accounts.find((entry) => entry.id === id);
      if (!account) throw new Error('账号不存在');
      return host.providers.get<AccountProvider>('accounts', account.provider).refresh(account);
    });
  },
};
