import { tr } from '../../shared/i18n';
import { defaultNetworkConfiguration, type NetworkConfiguration } from '../../shared/network';
import { proxyCredentialKey } from '../../shared/proxy-authentication';

export function networkConfiguration(value: Record<string, unknown>): NetworkConfiguration {
  const mode = value.mode ?? defaultNetworkConfiguration.mode;
  if (!['system', 'direct', 'custom'].includes(String(mode)))
    throw new Error(tr('network.invalidMode'));
  const proxyUrl = typeof value.proxyUrl === 'string' ? value.proxyUrl.trim() : '';
  if (mode === 'custom') {
    let url: URL;
    try {
      url = new URL(proxyUrl);
    } catch {
      throw new Error(tr('network.invalidUrl'));
    }
    if (
      !['http:', 'https:', 'socks5:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      (url.pathname && url.pathname !== '/') ||
      url.search ||
      url.hash
    )
      throw new Error(tr('network.invalidUrl'));
    const config: NetworkConfiguration = { mode, proxyUrl: `${url.protocol}//${url.host}` };
    if (value.credentialId !== undefined) {
      if (url.protocol === 'socks5:') throw new Error(tr('proxyAuth.unsupported'));
      if (typeof value.credentialId !== 'string')
        throw new Error(tr('proxyAuth.invalidCredential'));
      proxyCredentialKey(value.credentialId);
      config.username = proxyUsername(value.username);
      config.credentialId = value.credentialId;
    }
    return config;
  }
  return { mode: mode as NetworkConfiguration['mode'], proxyUrl: '' };
}

export function proxyUsername(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes(':') ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    throw new Error(tr('proxyAuth.invalidUsername'));
  return value;
}
