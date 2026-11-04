import type { Account } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import type { AccountAppearance } from '../../shared/skins';
import type { GameSession } from '../authentication';
import type { AccountProvider } from '../providers';

const endpoint = 'https://api.minecraftservices.com/minecraft/profile';
function invalid(): never {
  throw new Error(tr('skins.invalidProfile'));
}
function texture(value: unknown) {
  if (typeof value !== 'string') invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid();
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.hostname !== 'textures.minecraft.net' ||
    url.port ||
    url.username ||
    url.password ||
    !/^\/texture\/[0-9a-f]+$/i.test(url.pathname)
  )
    invalid();
  url.protocol = 'https:';
  return url.href;
}
export function parseAppearance(value: unknown, uuid: string): AccountAppearance {
  if (!value || typeof value !== 'object') invalid();
  const profile = value as { id?: unknown; skins?: unknown; capes?: unknown };
  if (profile.id !== uuid || !Array.isArray(profile.skins) || !Array.isArray(profile.capes))
    invalid();
  const skins = profile.skins.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') invalid();
    const skin = entry as Record<string, unknown>;
    if (
      !['ACTIVE', 'INACTIVE'].includes(String(skin.state)) ||
      !['SLIM', 'CLASSIC'].includes(String(skin.variant))
    )
      invalid();
    return {
      url: texture(skin.url),
      model: skin.variant === 'SLIM' ? ('slim' as const) : ('classic' as const),
      isDefault: typeof skin.alias === 'string',
      active: skin.state === 'ACTIVE',
    };
  });
  return {
    skin: skins.find((skin) => skin.active) ?? null,
    capes: profile.capes.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object') invalid();
      const cape = entry as Record<string, unknown>;
      if (
        typeof cape.id !== 'string' ||
        !cape.id ||
        typeof cape.alias !== 'string' ||
        !['ACTIVE', 'INACTIVE'].includes(String(cape.state))
      )
        invalid();
      return {
        id: cape.id,
        name: cape.alias,
        url: texture(cape.url),
        active: cape.state === 'ACTIVE',
      };
    }),
  };
}

export function microsoftAppearance(
  session: (account: Account, signal: AbortSignal) => Promise<GameSession>,
): NonNullable<AccountProvider['appearance']> {
  async function request(
    account: Account,
    path: string,
    signal: AbortSignal,
    init: RequestInit = {},
  ) {
    const credentials = await session(account, signal);
    const response = await fetch(`${endpoint}${path}`, {
      ...init,
      signal,
      redirect: 'error',
      headers: { ...init.headers, Authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(tr('skins.requestFailed', { status: response.status }));
    }
    return response;
  }
  async function profile(account: Account, signal: AbortSignal) {
    const response = await request(account, '', signal);
    return parseAppearance(await response.json(), account.uuid);
  }
  return {
    profile,
    async upload(account, png, model, signal) {
      const form = new FormData();
      form.set('variant', model);
      form.set('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'skin.png');
      const response = await request(account, '/skins', signal, { method: 'POST', body: form });
      await response.body?.cancel();
    },
    async reset(account, signal) {
      const response = await request(account, '/skins/active', signal, { method: 'DELETE' });
      await response.body?.cancel();
    },
    async cape(account, id, signal) {
      if (id !== null && !(await profile(account, signal)).capes.some((cape) => cape.id === id))
        throw new Error(tr('skins.capeNotOwned'));
      const response = await request(
        account,
        '/capes/active',
        signal,
        id === null
          ? { method: 'DELETE' }
          : {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ capeId: id }),
            },
      );
      await response.body?.cancel();
    },
  };
}
