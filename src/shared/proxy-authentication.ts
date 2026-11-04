import { tr } from './i18n';
import type { NetworkConfiguration } from './network';

export interface ProxyCredential {
  proxyUrl: string;
  username: string;
  password: string;
}

export function proxyCredentialKey(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new Error(tr('proxyAuth.invalidCredential'));
  return `network.proxy.${id}`;
}

/** The stored endpoint and username must match before either process uses the secret. */
export function readProxyCredential(
  serialized: string | null | undefined,
  config: NetworkConfiguration,
): ProxyCredential {
  if (config.mode !== 'custom' || !/^https?:\/\//.test(config.proxyUrl))
    throw new Error(tr('proxyAuth.unsupported'));
  let value: ProxyCredential;
  try {
    value = JSON.parse(serialized || 'null') as ProxyCredential;
  } catch {
    throw new Error(tr('proxyAuth.invalidCredential'));
  }
  if (
    !value ||
    value.proxyUrl !== config.proxyUrl ||
    value.username !== config.username ||
    typeof value.password !== 'string' ||
    !value.password
  )
    throw new Error(tr('proxyAuth.invalidCredential'));
  return value;
}
