import type { LauncherSnapshot } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import type { HostClient } from '../host-client';
import type { ApplicationUpdater } from './controller';

/** A platform result must reach the Host before shutdown disposes its held idle lock. */
export class UpdateInstallation {
  frozen = false;
  private recovering = false;
  private failedAttempt = false;
  private suppressQueuedQuit = false;
  constructor(
    private readonly updates: ApplicationUpdater,
    private readonly host: Pick<HostClient, 'stop' | 'restart'>,
    private readonly snapshot: () => Pick<LauncherSnapshot, 'running' | 'tasks'>,
    private readonly recoveryFailed: () => void,
  ) {}
  request() {
    const state = this.snapshot();
    if (
      this.frozen ||
      state.running.length ||
      state.tasks.some((task) => task.status === 'running')
    )
      throw new Error(tr('appUpdates.installBusy'));
    const result = this.updates.prepareInstall();
    this.failedAttempt = false;
    this.suppressQueuedQuit = false;
    this.frozen = true;
    setImmediate(() => void this.install());
    return result;
  }
  private async install() {
    try {
      await this.host.stop();
      this.updates.install();
    } catch (error) {
      await this.failed(error);
    }
  }
  async failed(error: unknown) {
    this.failedAttempt = true;
    if (this.recovering) return;
    this.recovering = true;
    this.updates.installationFailed(error);
    try {
      await this.host.restart();
    } catch {
      this.recoveryFailed();
    } finally {
      this.frozen = false;
      this.recovering = false;
    }
  }
  beforeQuitForUpdate() {
    // BaseUpdater emits this immediately before its queued app.quit(), even after async failure.
    this.suppressQueuedQuit = this.failedAttempt;
    this.failedAttempt = false;
  }
  consumeFailedUpdateQuit() {
    const prevent = this.suppressQueuedQuit;
    this.suppressQueuedQuit = false;
    return prevent;
  }
}
