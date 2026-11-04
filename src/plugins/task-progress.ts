import type { TaskContext } from '../shared/host-api';

export function taskProgress(task: TaskContext) {
  return {
    signal: task.signal,
    update: (message: string, current = 0, total = 0) =>
      task.report(total ? (current / total) * 100 : 0, message),
  };
}
