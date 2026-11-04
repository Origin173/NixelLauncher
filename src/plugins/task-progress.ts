import type { TaskContext } from '../shared/host-api';

export function taskPhase(task: TaskContext, start: number, end: number): TaskContext {
  return {
    ...task,
    report: (progress, detail) => task.report(start + ((end - start) * progress) / 100, detail),
  };
}

export function taskProgress(task: TaskContext) {
  return {
    signal: task.signal,
    update: (message: string, current = 0, total = 0) =>
      task.report(total ? (current / total) * 100 : 0, message),
  };
}
