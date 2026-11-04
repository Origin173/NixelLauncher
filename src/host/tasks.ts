import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Context } from 'cordis';
import type { Task } from '../shared/contracts';
import { errorMessage } from '../shared/error-message';
import type { ProviderRegistry, TaskContext, TaskManager } from '../shared/host-api';
import { tr } from '../shared/i18n';
import { migrateIdentifier } from '../shared/migrate-identifiers';
import { taskScope } from '../shared/task-scope';
import type { JsonStorage } from './storage';

type Runner = (context: TaskContext) => Promise<void>;
interface TaskRun {
  abort: AbortController;
  promise: Promise<void>;
  run: Runner;
  owner?: Context;
  execution?: TaskContext;
  controls?: { pause(): void; resume(): void };
}

export const commandOwner = new AsyncLocalStorage<Context>();

export class HostTasks implements TaskManager {
  private tasks: Task[] = [];
  private runs = new Map<string, TaskRun>();
  private writeTimer: ReturnType<typeof setTimeout> | undefined;
  private lifecycleBusy = false;

  whileIdle<T>(action: () => Promise<T>) {
    return this.lifecycle(undefined, action);
  }

  async lifecycle<T>(taskId: string | undefined, action: () => Promise<T>) {
    if (
      this.lifecycleBusy ||
      this.tasks.some((task) => task.status === 'running' && task.id !== taskId)
    )
      throw new Error(tr('plugins.stopGamesAndCancelActiveTasksBefore'));
    this.lifecycleBusy = true;
    try {
      return await action();
    } finally {
      this.lifecycleBusy = false;
    }
  }

  constructor(
    private readonly storage: JsonStorage,
    private readonly changed: () => void,
    private readonly replay: (
      command: string,
      params: Record<string, unknown>,
    ) => Promise<{ taskId: string }>,
    private readonly providers: () => ProviderRegistry,
  ) {}

  async load() {
    this.tasks = await this.storage.read<Task[]>('tasks', []);
    for (const task of this.tasks) {
      delete task.activity;
      delete task.canPause;
      if (task.retry && typeof task.retry.params.category === 'string')
        task.retry.params.category = migrateIdentifier(task.retry.params.category);
      if (task.status !== 'running') continue;
      task.status = 'failed';
      task.error = tr('tasks.theHostExitedBeforeThisTaskFinished');
      task.finishedAt = new Date().toISOString();
    }
    await this.persist();
  }

  private touch() {
    this.changed();
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = undefined;
      void this.persist().catch(console.error);
    }, 150);
  }

  private persist() {
    return this.storage.write('tasks', this.tasks);
  }

  list() {
    return structuredClone(this.tasks);
  }

  start(
    name: string,
    detail: string,
    run: Runner,
    context: {
      instanceId?: string;
      resourceId?: string;
      resourceSource?: string;
      kind?: string;
      retry?: Task['retry'];
    } = {},
  ) {
    if (this.lifecycleBusy) throw new Error(tr('plugins.stopGamesAndCancelActiveTasksBefore'));
    const task: Task = {
      id: randomUUID(),
      name,
      detail,
      status: 'running',
      progress: 0,
      kind: context.kind ?? 'operation',
      instanceId: context.instanceId,
      resourceId: context.resourceId,
      resourceSource: context.resourceSource,
      retry: context.retry ? structuredClone(context.retry) : undefined,
      logs: [],
      createdAt: new Date().toISOString(),
    };
    this.tasks.unshift(task);
    const abort = new AbortController();
    const owner = commandOwner.getStore();
    const promise = this.persist()
      .then(async () => {
        abort.signal.throwIfAborted();
        const execution: TaskContext = {
          taskId: task.id,
          signal: abort.signal,
          setControls: (controls) => {
            const running = this.runs.get(task.id);
            if (running) running.controls = controls;
            task.canPause = Boolean(controls);
            if (!controls) delete task.activity;
            this.touch();
          },
          setActivity: (activity) => {
            if (task.status !== 'running') return;
            task.activity = activity;
            this.touch();
          },
          setInstance: (id) => {
            task.instanceId = id;
            this.touch();
          },
          report: (progress, nextDetail) => {
            if (task.status !== 'running') return;
            task.progress = Math.max(0, Math.min(100, progress));
            if (nextDetail !== undefined) task.detail = nextDetail;
            this.touch();
          },
          log: (line) => {
            task.logs.push(line);
            if (task.logs.length > 500) task.logs.splice(0, task.logs.length - 500);
            this.touch();
          },
        };
        const running = this.runs.get(task.id);
        if (running) running.execution = execution;
        await taskScope.run({ task: execution, providers: this.providers() }, () => run(execution));
        abort.signal.throwIfAborted();
        task.status = 'completed';
        task.progress = 100;
      })
      .catch((error: unknown) => {
        task.status = abort.signal.aborted ? 'cancelled' : 'failed';
        if (!abort.signal.aborted) task.error = errorMessage(error);
      })
      .then(async () => {
        delete task.activity;
        delete task.canPause;
        const running = this.runs.get(task.id);
        if (running) delete running.controls;
        task.finishedAt = new Date().toISOString();
        await this.persist();
        this.changed();
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        task.status = 'failed';
        task.error = [task.error, tr('tasks.couldNotSaveTaskStateValue', { value1: message })]
          .filter(Boolean)
          .join('\n');
        this.changed();
      });
    this.runs.set(task.id, { abort, promise, run, owner });
    this.changed();
    return task.id;
  }

  cancel(id: string) {
    const task = this.tasks.find((item) => item.id === id);
    if (!task) throw new Error(tr('tasks.taskNotFound'));
    if (task.status === 'running') this.runs.get(id)?.abort.abort();
  }

  assertOwner(ctx: Context, execution: TaskContext) {
    const run = this.runs.get(execution.taskId);
    if (
      !run ||
      run.execution !== execution ||
      run.owner?.fiber !== ctx.fiber ||
      this.tasks.find((task) => task.id === execution.taskId)?.status !== 'running'
    )
      throw new Error(tr('pluginDist.owner'));
    execution.signal.throwIfAborted();
  }

  pause(id: string) {
    this.controls(id).pause();
  }

  resume(id: string) {
    this.controls(id).resume();
  }

  private controls(id: string) {
    const task = this.tasks.find((item) => item.id === id);
    const controls = this.runs.get(id)?.controls;
    if (task?.status !== 'running' || !controls) throw new Error(tr('tasks.pauseUnavailable'));
    return controls;
  }

  async retry(id: string) {
    const previous = this.tasks.find((item) => item.id === id);
    const runner = this.runs.get(id);
    if (!previous) throw new Error(tr('tasks.taskNotFound'));
    if (previous.status === 'running') throw new Error(tr('tasks.thisTaskIsStillRunning'));
    if (previous.retry) {
      const result = await this.replay(
        previous.retry.command,
        structuredClone(previous.retry.params),
      );
      return result.taskId;
    }
    if (!runner) throw new Error(tr('tasks.thisTaskCanNoLongerBeRetried'));
    const start = () => this.start(previous.name, previous.detail, runner.run, previous);
    return runner.owner ? commandOwner.run(runner.owner, start) : start();
  }

  clear() {
    this.tasks = this.tasks.filter((task) => {
      if (task.status === 'running') return true;
      this.runs.delete(task.id);
      return false;
    });
    this.touch();
  }

  async disposeOwner(owner: Context) {
    const pending: Promise<void>[] = [];
    for (const [id, run] of this.runs) {
      if (run.owner?.fiber !== owner.fiber) continue;
      run.abort.abort();
      pending.push(run.promise);
      this.runs.delete(id);
    }
    await Promise.all(pending);
  }

  async dispose() {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    for (const run of this.runs.values()) run.abort.abort();
    await Promise.all([...this.runs.values()].map((run) => run.promise));
    await this.persist();
  }
}
