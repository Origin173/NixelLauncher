import type { AppUpdateAction } from '../../shared/app-updates';
import type { NixelHost, TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';

export async function runUpdate(
  host: NixelHost,
  task: TaskContext,
  action: Extract<AppUpdateAction, 'check' | 'download'>,
) {
  const cancel = () => {
    void host.platform.appUpdates('cancel').catch(() => task.log(tr('appUpdates.cancelFailed')));
  };
  task.signal.throwIfAborted();
  task.signal.addEventListener('abort', cancel, { once: true });
  const timer =
    action === 'download'
      ? setInterval(() => {
          void host.platform.appUpdates('status').then(
            (state) => {
              if (state.progress) task.report(state.progress.percent);
            },
            () => task.log(tr('appUpdates.progressUnavailable')),
          );
        }, 500)
      : undefined;
  try {
    const state = await host.platform.appUpdates(action);
    task.signal.throwIfAborted();
    if (state.phase === 'error') throw new Error(state.error);
    task.log(tr(`appUpdates.${state.phase}`));
  } finally {
    if (timer) clearInterval(timer);
    task.signal.removeEventListener('abort', cancel);
  }
}
