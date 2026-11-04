import {
  type AuthenticationResponseDetails,
  type AuthInfo,
  app,
  type Event,
  type Session,
  session,
  type WebContents,
} from 'electron';
import { tr } from '../shared/i18n';
import type { NetworkConfiguration } from '../shared/network';
import {
  type ProxyCredential,
  proxyCredentialKey,
  readProxyCredential,
} from '../shared/proxy-authentication';
import type { SecretStorage } from './secrets';

let active: { config: NetworkConfiguration; credential?: ProxyCredential } | undefined;
let pending = Promise.resolve();
const sessions = new Set<Session>();

function login(
  event: Event,
  webContents: WebContents | null,
  details: AuthenticationResponseDetails,
  authInfo: AuthInfo,
  callback: (username?: string, password?: string) => void,
) {
  if (webContents && !sessions.has(webContents.session)) return;
  const credential = matchingCredential(authInfo);
  if (!credential) return;
  event.preventDefault();
  // Electron 45 exposes this per request: a rejected password must not be submitted repeatedly.
  if (!details.firstAuthAttempt) {
    callback();
    return;
  }
  callback(credential.username, credential.password);
}

function matchingCredential(authInfo: AuthInfo) {
  if (
    !active?.credential ||
    active.config.mode !== 'custom' ||
    !authInfo.isProxy ||
    authInfo.scheme.toLowerCase() !== 'basic'
  )
    return;
  const proxy = new URL(active.config.proxyUrl);
  const host = (value: string) => value.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    host(authInfo.host) !== host(proxy.hostname) ||
    authInfo.port !== Number(proxy.port || (proxy.protocol === 'https:' ? 443 : 80))
  )
    return;
  return active.credential;
}

/** Main-process consumers own their retry budget; no credential value leaves this callback. */
export function answerProxyAuthentication(
  authInfo: AuthInfo,
  callback: (username?: string, password?: string) => void,
) {
  const credential = matchingCredential(authInfo);
  if (!credential) {
    callback();
    return false;
  }
  callback(credential.username, credential.password);
  return true;
}

export function installProxyAuthentication() {
  sessions.add(session.defaultSession);
  app.on('login', login);
  app.once('will-quit', () => {
    active = undefined;
    sessions.clear();
    app.removeListener('login', login);
  });
}

async function applySession(target: Session, config: NetworkConfiguration) {
  await target.closeAllConnections();
  await target.clearAuthCache();
  await target.setProxy(
    config.mode === 'custom'
      ? { mode: 'fixed_servers', proxyRules: config.proxyUrl, proxyBypassRules: '<-loopback>' }
      : { mode: config.mode },
  );
}

async function apply(config: NetworkConfiguration) {
  await Promise.all([...sessions].map((target) => applySession(target, config)));
}

/** Register another launcher-owned Chromium session before it makes requests. */
export function registerNetworkSession(target: Session) {
  const operation = pending.then(async () => {
    if (sessions.has(target)) return;
    await applySession(target, active?.config || { mode: 'system', proxyUrl: '' });
    sessions.add(target);
  });
  pending = operation.then(
    () => {},
    () => {},
  );
  return operation;
}

export function configureProxy(config: NetworkConfiguration, secrets: SecretStorage) {
  const operation = pending.then(async () => {
    const credential = config.credentialId
      ? readProxyCredential(secrets.get(proxyCredentialKey(config.credentialId)), config)
      : undefined;
    const previous = active;
    active = undefined;
    try {
      await apply(config);
      active = { config, credential };
    } catch {
      try {
        await apply(previous?.config || { mode: 'system', proxyUrl: '' });
        active = previous;
      } catch {
        throw new Error(tr('proxyAuth.restoreFailed'));
      }
      throw new Error(tr('proxyAuth.configureFailed'));
    }
  });
  // The caller receives failures; subsequent configuration must still be able to recover.
  pending = operation.then(
    () => {},
    () => {},
  );
  return operation;
}

export function resolveProxy(url: string) {
  return session.defaultSession.resolveProxy(url);
}
