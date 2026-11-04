import type { AuthInfo } from 'electron';
import type { AppUpdater, UpdateCheckResult } from 'electron-updater';
import { parse } from 'semver';
import type { AppUpdateState } from '../../shared/app-updates';
import { tr } from '../../shared/i18n';

export class ApplicationUpdater {
  private token: UpdateCheckResult['cancellationToken'];
  private generation = 0;
  private busy = false;
  private credentialsUsed = false;
  private authenticationFailed = false;
  private installationAttempted = false;
  private errorHandler: (error: Error) => void;
  constructor(
    private readonly updater: AppUpdater | undefined,
    private state: AppUpdateState,
    private readonly feed: string,
    onInstallError: (error: Error) => void,
    authenticate?: (
      info: AuthInfo,
      reply: (username?: string, password?: string) => void,
    ) => boolean,
  ) {
    this.errorHandler = (error) => {
      const installing = this.state.phase === 'installing';
      if (installing) {
        this.installationFailed(error);
        onInstallError(error);
      }
    };
    if (updater) {
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
      updater.allowDowngrade = false;
      updater.allowPrerelease = false;
      updater.disableWebInstaller = true;
      updater.disableDifferentialDownload = true;
      updater.logger = null;
      updater.on('error', this.errorHandler);
      updater.on('login', (info, callback) => {
        // Electron's callback accepts no arguments to cancel; the library types require two.
        const reply = callback as (username?: string, password?: string) => void;
        if (!this.busy || this.credentialsUsed || !authenticate) {
          this.authenticationFailed = true;
          this.token?.cancel();
          reply();
          return;
        }
        this.credentialsUsed = true;
        if (!authenticate(info, reply)) this.authenticationFailed = true;
      });
      updater.on('download-progress', (progress) => {
        if (this.state.phase === 'downloading')
          this.state.progress = {
            percent: progress.percent,
            transferred: progress.transferred,
            total: progress.total,
            bytesPerSecond: progress.bytesPerSecond,
          };
      });
    }
  }
  status(): AppUpdateState {
    return structuredClone(this.state);
  }
  private requireUpdater() {
    if (!this.updater || this.state.availability !== 'ready')
      throw new Error(tr(`appUpdates.${this.state.availability}`));
    return this.updater;
  }
  private fail(error: unknown, installing = false) {
    const code = this.authenticationFailed
      ? 'PROXY_AUTHENTICATION_FAILED'
      : (error as { code?: unknown })?.code;
    this.state.phase = 'error';
    // Updater errors can include complete signed URLs and HTTP response bodies.
    this.state.error = tr(installing ? 'appUpdates.installFailed' : 'appUpdates.failed', {
      code: typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? code : 'UPDATE_ERROR',
    });
    this.token = undefined;
  }
  async check() {
    const updater = this.requireUpdater();
    if (this.busy || this.state.phase === 'installing') throw new Error(tr('appUpdates.busy'));
    this.busy = true;
    this.credentialsUsed = false;
    this.authenticationFailed = false;
    const generation = ++this.generation;
    this.state = {
      availability: this.state.availability,
      currentVersion: this.state.currentVersion,
      releaseUrl: this.state.releaseUrl,
      downloaded: this.state.downloaded,
      installRestartRequired: this.state.installRestartRequired,
      phase: 'checking',
      checkedAt: new Date().toISOString(),
    };
    try {
      const result = await updater.checkForUpdates();
      if (generation !== this.generation) return this.status();
      if (!result) throw new Error('Update check unavailable');
      if (this.authenticationFailed) throw new Error('Proxy authentication failed');
      const info = result.updateInfo;
      const version = parse(info.version);
      if (!version || version.prerelease.length)
        throw Object.assign(new Error('Only stable update versions are supported'), {
          code: 'ERR_UPDATER_UNSUPPORTED_VERSION',
        });
      if (
        !info.files?.length ||
        info.files.some((file) => {
          const url = new URL(file.url, this.feed);
          return (
            url.protocol !== 'https:' ||
            Boolean(url.username || url.password) ||
            !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512)
          );
        })
      )
        throw new Error('Invalid update metadata');
      this.token = result.cancellationToken;
      this.state.phase =
        this.state.downloaded?.version === info.version
          ? 'downloaded'
          : result.isUpdateAvailable
            ? 'available'
            : 'current';
      this.state.version = info.version;
      this.state.notes =
        typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : info.releaseNotes?.map((note) => `${note.version}\n${note.note ?? ''}`).join('\n\n');
      this.state.checkedAt = new Date().toISOString();
    } catch (error) {
      if (generation === this.generation) this.fail(error);
      throw new Error(this.state.error ?? tr('appUpdates.cancelled'));
    } finally {
      this.busy = false;
    }
    return this.status();
  }
  async download() {
    const updater = this.requireUpdater();
    if (this.busy || this.state.phase !== 'available' || !this.token)
      throw new Error(tr('appUpdates.checkFirst'));
    this.busy = true;
    this.credentialsUsed = false;
    this.authenticationFailed = false;
    const token = this.token;
    // A new download can replace/clear the library's cached installer; only checks retain it.
    this.state.downloaded = undefined;
    this.state.phase = 'downloading';
    this.state.error = undefined;
    try {
      await updater.downloadUpdate(token);
      if (this.authenticationFailed) throw new Error('Proxy authentication failed');
      if (!token.cancelled) {
        this.state.phase = 'downloaded';
        this.state.downloaded = { version: this.state.version as string, notes: this.state.notes };
      }
    } catch (error) {
      if (!token.cancelled || this.authenticationFailed) {
        this.fail(error);
        throw new Error(this.state.error);
      }
    } finally {
      this.busy = false;
    }
    return this.status();
  }
  cancel() {
    if (this.state.phase === 'checking') {
      this.generation++;
      this.state.phase = this.state.downloaded ? 'downloaded' : 'idle';
    }
    if (this.state.phase === 'downloading') {
      this.token?.cancel();
      this.state.phase = 'idle';
      this.state.progress = undefined;
    }
    return this.status();
  }
  prepareInstall() {
    this.requireUpdater();
    if (this.busy) throw new Error(tr('appUpdates.busy'));
    if (this.state.installRestartRequired) throw new Error(tr('appUpdates.restartRequired'));
    if (!this.state.downloaded) throw new Error(tr('appUpdates.downloadFirst'));
    this.installationAttempted = false;
    this.authenticationFailed = false;
    this.state.phase = 'installing';
    return this.status();
  }
  install() {
    this.installationAttempted = true;
    this.requireUpdater().quitAndInstall(false, true);
  }
  installationFailed(error: unknown) {
    if (this.installationAttempted) this.state.installRestartRequired = true;
    this.fail(error, this.installationAttempted);
  }
}
