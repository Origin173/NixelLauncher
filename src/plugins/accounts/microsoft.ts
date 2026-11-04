import { randomUUID } from 'node:crypto';
import type { Context } from 'cordis';
import { serviceEnvironment } from '../../host/service-environment';
import type { Account, DeviceLogin } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import { minecraftSession } from '../authentication';
import { commandsFor } from '../commands';
import { json } from '../files';
import { microsoftId, register, save } from './shared';

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
  xuid?: string;
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
    async function complete(tokens: OAuthTokens, clientId: string, signal?: AbortSignal) {
      const minecraft = await minecraftSession(tokens.access_token, signal);
      const profile = await json<{ id: string; name: string }>(
        'https://api.minecraftservices.com/minecraft/profile',
        { headers: { Authorization: `Bearer ${minecraft.access_token}` }, signal },
      );
      const id = `${microsoftId}:${profile.id}`;
      const expiresAt = Date.now() + minecraft.expires_in * 1000;
      const secret: MicrosoftSecret = {
        refreshToken: tokens.refresh_token,
        accessToken: minecraft.access_token,
        expiresAt,
        clientId,
        xuid: minecraft.xuid,
      };
      await host.platform.secretSet(`account:${id}`, JSON.stringify(secret));
      return save(host, {
        id,
        name: profile.name,
        uuid: profile.id,
        type: 'microsoft',
        provider: microsoftId,
        color: 'blue',
        detail: 'Minecraft Java · Microsoft',
        expiresAt,
      });
    }
    async function refresh(account: Account, signal?: AbortSignal) {
      const text = await host.platform.secretGet(`account:${account.id}`);
      if (!text) throw new Error(tr('accounts.microsoftCredentialsNotFoundSignInAgain'));
      const secret = JSON.parse(text) as MicrosoftSecret;
      const response = await fetch(`${oauth}/token`, {
        method: 'POST',
        signal,
        body: new URLSearchParams({
          client_id: secret.clientId,
          grant_type: 'refresh_token',
          refresh_token: secret.refreshToken,
          scope,
        }),
      });
      if (!response.ok) throw new Error(tr('accounts.couldNotRefreshTheMicrosoftSessionSign'));
      const tokens = (await response.json()) as OAuthTokens;
      return complete(
        { ...tokens, refresh_token: tokens.refresh_token || secret.refreshToken },
        secret.clientId,
        signal,
      );
    }
    register(
      ctx,
      microsoftId,
      { name: 'Microsoft' },
      {
        refresh,
        async session(account, signal) {
          if (!account.expiresAt || account.expiresAt < Date.now() + 60000)
            account = await refresh(account, signal);
          signal.throwIfAborted();
          const text = await host.platform.secretGet(`account:${account.id}`);
          if (!text) throw new Error(tr('accounts.microsoftCredentialsNotFound'));
          const secret = JSON.parse(text) as MicrosoftSecret;
          return {
            accessToken: secret.accessToken,
            clientId: secret.clientId,
            xuid: secret.xuid,
            gameProfile: { id: account.uuid, name: account.name },
            userType: 'msa',
          };
        },
      },
    );
    const command = commandsFor(ctx);
    command('accounts.microsoft.start', async (): Promise<DeviceLogin> => {
      const clientId = serviceEnvironment.microsoftClientId;
      if (!clientId) throw new Error(tr('accounts.setMicrosoftClientIdInEnvAnd'));
      const response = await fetch(`${oauth}/devicecode`, {
        method: 'POST',
        body: new URLSearchParams({ client_id: clientId, scope }),
      });
      if (!response.ok)
        throw new Error(
          tr('accounts.cannotStartMicrosoftSignInHttpValue', { value1: response.status }),
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
        throw new Error(tr('accounts.theDeviceCodeHasExpiredSignIn'));
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
      if (!response.ok)
        throw new Error(
          tr('accounts.microsoftSignInFailedValue', { value1: body.error || response.status }),
        );
      return { status: 'complete', account: await complete(body, login.clientId) };
    });
    ctx.effect(() => () => {
      pending.clear();
    });
  },
};
