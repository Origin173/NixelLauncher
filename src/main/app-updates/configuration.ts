import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AppUpdateState } from '../../shared/app-updates';

export interface UpdateEnvironment {
  feed: string;
  release: string;
  publisher: string;
}
export function readUpdateEnvironment(): UpdateEnvironment {
  const values = {
    feed: process.env.NIXEL_UPDATE_FEED_URL ?? '',
    release: process.env.NIXEL_UPDATE_RELEASE_URL ?? '',
    publisher: process.env.NIXEL_UPDATE_PUBLISHER ?? '',
  };
  for (const key of ['NIXEL_UPDATE_FEED_URL', 'NIXEL_UPDATE_RELEASE_URL', 'NIXEL_UPDATE_PUBLISHER'])
    delete process.env[key];
  return values;
}
export function publicHttps(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('Invalid update URL');
  return url;
}
export function updateAvailability(
  config: UpdateEnvironment,
  packaged: boolean,
  platform = process.platform,
): AppUpdateState['availability'] {
  try {
    if (config.release) publicHttps(config.release);
    if (config.feed) publicHttps(config.feed);
  } catch {
    return 'invalidConfiguration';
  }
  if (!config.feed) return 'unconfigured';
  if (!packaged) return 'development';
  if (platform === 'win32') {
    if (process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE)
      return 'portable';
    if (!existsSync(join(dirname(process.execPath), 'Uninstall NixelLauncher.exe')))
      return 'manual';
    if (!config.publisher.trim()) return 'publisherRequired';
  } else if (platform === 'linux') {
    if (!process.env.APPIMAGE) return 'manual';
  } else if (platform !== 'darwin') return 'manual';
  return 'ready';
}
