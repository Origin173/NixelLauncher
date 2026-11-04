import { session } from 'electron';
import type { NetworkConfiguration } from '../shared/network';

export async function configureProxy(config: NetworkConfiguration) {
  await session.defaultSession.setProxy(
    config.mode === 'custom'
      ? { mode: 'fixed_servers', proxyRules: config.proxyUrl, proxyBypassRules: '<-loopback>' }
      : { mode: config.mode },
  );
  await session.defaultSession.closeAllConnections();
}

export function resolveProxy(url: string) {
  return session.defaultSession.resolveProxy(url);
}
