import { useEffect, useState } from 'react';
import { type AppUpdateState, appUpdatesId } from '../../../shared/app-updates';
import { tr } from '../../../shared/i18n';
import { useApp } from '../state';
import { Action, Group, Notice, SettingRow, Toggle } from '../ui';

export function ApplicationUpdates() {
  const a = useApp();
  const plugin = a.plugins.find((entry) => entry.id === appUpdatesId);
  const [state, setState] = useState<AppUpdateState>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const tasks = a.tasks.filter((task) => task.kind === 'application-update');
  const latestTask = tasks[0];
  const active = tasks.find((task) => task.status === 'running');
  const activeId = active?.id;
  const busy = a.running.length > 0 || a.tasks.some((task) => task.status === 'running');
  const errors = [
    ...new Set(
      [error, state?.error, latestTask?.status === 'failed' ? latestTask.error : undefined].filter(
        Boolean,
      ),
    ),
  ].join('\n');
  // biome-ignore lint/correctness/useExhaustiveDependencies: Task changes refresh system status even when a short operation finishes before polling starts.
  useEffect(() => {
    if (plugin?.status !== 'active' || a.host.status !== 'ready') return;
    let disposed = false;
    const refresh = () => {
      void window.nixel.invoke<AppUpdateState>('appUpdates.status').then(
        (value) => {
          if (!disposed) {
            setState(value);
            setError('');
          }
        },
        (reason: Error) => {
          if (!disposed) setError(reason.message);
        },
      );
    };
    refresh();
    const timer = activeId ? setInterval(refresh, 500) : undefined;
    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
    };
  }, [plugin?.status, a.host.status, latestTask, activeId]);
  if (plugin?.status !== 'active') return null;
  const run = async (command: string, input?: unknown) => {
    setPending(true);
    try {
      if (command === 'appUpdates.install') {
        const next = await a.command<AppUpdateState>(command, input);
        if (next) setState(next);
      } else await a.command(command, input);
    } finally {
      setPending(false);
    }
  };
  return (
    <Group title={tr('appUpdates.title')}>
      {errors && <Notice>{errors}</Notice>}
      {state && (
        <>
          <p className="muted">
            {state.availability !== 'ready'
              ? tr(`appUpdates.${state.availability}`)
              : tr(`appUpdates.${state.phase}`)}
          </p>
          {state.version && state.phase !== 'current' && (
            <p>{tr('appUpdates.version', { version: state.version })}</p>
          )}
          {state.progress && (
            <progress
              aria-label={tr('appUpdates.downloading')}
              value={state.progress.percent}
              max={100}
            />
          )}
          {state.notes && (
            <details>
              <summary>{tr('appUpdates.releaseNotes')}</summary>
              <p style={{ whiteSpace: 'pre-wrap' }}>{state.notes}</p>
            </details>
          )}
          <SettingRow title={tr('appUpdates.autoCheck')}>
            <Toggle
              label={tr('appUpdates.autoCheck')}
              value={plugin.config.autoCheck === true}
              disabled={busy || pending || state.phase === 'installing'}
              onChange={(autoCheck) => void run('appUpdates.configure', { autoCheck })}
            />
          </SettingRow>
          <div className="row wrap">
            <Action
              size="sm"
              isDisabled={
                pending ||
                Boolean(active) ||
                state.availability !== 'ready' ||
                state.phase === 'installing'
              }
              onPress={() => void run('appUpdates.check')}
            >
              {tr('appUpdates.check')}
            </Action>
            {state.phase === 'available' && (
              <Action
                size="sm"
                isDisabled={pending || Boolean(active)}
                onPress={() => void run('appUpdates.download')}
              >
                {tr('appUpdates.download')}
              </Action>
            )}
            {active && (
              <Action
                size="sm"
                variant="secondary"
                onPress={() => void run('tasks.cancel', { id: active.id })}
              >
                {tr('overlays.cancel')}
              </Action>
            )}
            {state.phase === 'downloaded' && (
              <Action
                size="sm"
                isDisabled={pending || busy}
                onPress={() =>
                  a.setOverlay({
                    type: 'confirm',
                    title: tr('appUpdates.install'),
                    detail: tr('appUpdates.installConfirm'),
                    action: () => run('appUpdates.install'),
                  })
                }
              >
                {tr('appUpdates.install')}
              </Action>
            )}
            {state.releaseUrl && (
              <Action
                size="sm"
                variant="secondary"
                onPress={() => void window.nixel.openExternal(state.releaseUrl as string)}
              >
                {tr('appUpdates.releasePage')}
              </Action>
            )}
          </div>
        </>
      )}
    </Group>
  );
}
