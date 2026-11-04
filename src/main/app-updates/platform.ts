import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import electronUpdater, { type AppUpdater } from 'electron-updater';
import { answerProxyAuthentication, registerNetworkSession } from '../network';
import { publicHttps, type UpdateEnvironment, updateAvailability } from './configuration';
import { ApplicationUpdater } from './controller';

export async function createApplicationUpdater(
  config: UpdateEnvironment,
  onInstallError: () => void,
) {
  const availability = updateAvailability(config, app.isPackaged);
  let updater: AppUpdater | undefined;
  let feed = '';
  if (availability === 'ready') {
    feed = publicHttps(config.feed).href.replace(/\/?$/, '/');
    const Constructor =
      process.platform === 'win32'
        ? electronUpdater.NsisUpdater
        : process.platform === 'darwin'
          ? electronUpdater.MacUpdater
          : electronUpdater.AppImageUpdater;
    updater = new Constructor({ provider: 'generic', url: feed });
    const configPath = join(app.getPath('userData'), 'application-update.yml');
    // Standard updater metadata, containing only public release configuration.
    await writeFile(
      configPath,
      JSON.stringify({
        provider: 'generic',
        url: feed,
        updaterCacheDirName: 'nixel-launcher-updater',
        ...(process.platform === 'win32' ? { publisherName: config.publisher.trim() } : {}),
      }),
    );
    updater.updateConfigPath = configPath;
    await registerNetworkSession(updater.netSession);
    updater.netSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) =>
      callback({ cancel: new URL(details.url).protocol !== 'https:' }),
    );
  }
  return new ApplicationUpdater(
    updater,
    {
      availability,
      phase: 'idle',
      currentVersion: app.getVersion(),
      releaseUrl: availability === 'invalidConfiguration' ? undefined : config.release || undefined,
    },
    feed,
    onInstallError,
    answerProxyAuthentication,
  );
}
