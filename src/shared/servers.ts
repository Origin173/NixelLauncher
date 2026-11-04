import { tr } from './i18n';

export interface SavedServer {
  id: string;
  name: string;
  address: string;
}
export interface ServerAddress {
  host: string;
  port: number;
  address: string;
  explicitPort: boolean;
}
export interface GameLaunchOptions {
  server?: ServerAddress;
}
export interface ServerStatus {
  version: string;
  online: number;
  maximum: number;
  latency: number;
  description: string;
  checkedAt: string;
}

export function parseServerAddress(value: unknown): ServerAddress {
  if (typeof value !== 'string') throw new Error(tr('servers.invalidAddress'));
  const address = value.trim();
  if (!address || address.length > 255 || /[\s/@?#\\]/.test(address))
    throw new Error(tr('servers.invalidAddress'));
  let url: URL;
  try {
    url = new URL(`http://${address}`);
  } catch {
    throw new Error(tr('servers.invalidAddress'));
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const portText = address.startsWith('[')
    ? address.slice(address.indexOf(']') + 1)
    : address.slice(address.indexOf(':') < 0 ? address.length : address.indexOf(':'));
  const explicitPort = portText.length > 0;
  const port = explicitPort && /^:\d+$/.test(portText) ? Number(portText.slice(1)) : 25565;
  if (!host || (explicitPort && !/^:\d+$/.test(portText)) || port < 1 || port > 65535)
    throw new Error(tr('servers.invalidAddress'));
  const normalizedHost = host.includes(':') ? `[${host}]` : host;
  return {
    host,
    port,
    explicitPort,
    address: `${normalizedHost}${explicitPort ? `:${port}` : ''}`,
  };
}
