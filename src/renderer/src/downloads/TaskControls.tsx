import type { Task } from '../../../shared/contracts';
import { tr } from '../../../shared/i18n';
import { useApp } from '../state';
import { Action } from '../ui';

export function TaskControls({ task }: { task: Task }) {
  const a = useApp();
  return (
    <div className="row">
      {task.canPause && (
        <Action
          size="sm"
          variant="secondary"
          onPress={() =>
            void a.command(task.activity === 'paused' ? 'tasks.resume' : 'tasks.pause', {
              id: task.id,
            })
          }
        >
          {tr(task.activity === 'paused' ? 'downloads.resume' : 'downloads.pause')}
        </Action>
      )}
      <Action size="sm" variant="ghost" onPress={() => a.cancelTask(task.id)}>
        {tr('overlays.cancel')}
      </Action>
    </div>
  );
}
