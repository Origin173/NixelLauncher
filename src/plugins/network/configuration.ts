import { tr } from '../../shared/i18n';
import { defaultNetworkConfiguration, type NetworkConfiguration } from '../../shared/network';

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
    return { mode, proxyUrl: `${url.protocol}//${url.host}` };
  }
  return { mode: mode as NetworkConfiguration['mode'], proxyUrl: '' };
}
