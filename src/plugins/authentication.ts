import { createHash } from 'node:crypto';
import { tr } from '../shared/i18n';
import { json } from './files';

export interface GameSession {
  accessToken: string;
  gameProfile: { id: string; name: string };
  userType: 'legacy' | 'msa' | 'mojang';
  clientId?: string;
  xuid?: string;
  yggdrasilAgent?: { jar: string; server: string };
}

export function offlineUUID(name: string) {
  const bytes = createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest();
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x30;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  return bytes.toString('hex');
}

function post<T>(url: string, body: unknown, signal?: AbortSignal) {
  return json<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

export async function minecraftSession(microsoftToken: string, signal?: AbortSignal) {
  const xbox = await post<{ Token: string }>(
    'https://user.auth.xboxlive.com/user/authenticate',
    {
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${microsoftToken}`,
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    },
    signal,
  );
  const xsts = await post<{
    Token: string;
    DisplayClaims: { xui: { uhs: string; xid?: string }[] };
  }>(
    'https://xsts.auth.xboxlive.com/xsts/authorize',
    {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbox.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT',
    },
    signal,
  );
  const hash = xsts.DisplayClaims.xui[0]?.uhs;
  if (!hash) throw new Error(tr('authentication.missingXboxProfile'));
  const minecraft = await post<{ access_token: string; expires_in: number }>(
    'https://api.minecraftservices.com/authentication/login_with_xbox',
    { identityToken: `XBL3.0 x=${hash};${xsts.Token}` },
    signal,
  );
  return { ...minecraft, xuid: xsts.DisplayClaims.xui[0]?.xid };
}
