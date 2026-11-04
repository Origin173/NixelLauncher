import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { LauncherSnapshot } from '../shared/contracts';

const maximumSize = 2 * 1024 * 1024;
type Metadata = Record<string, string | number | boolean | undefined>;

export function errorCode(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'UNKNOWN_ERROR';
}

/** Low-volume system events only. Never pass command arguments, errors or console output. */
export class ApplicationLog {
  readonly directory: string;
  private readonly path: string;
  private size: number | undefined;
  private failure: unknown;

  constructor(dataDirectory: string) {
    this.directory = join(dataDirectory, 'logs');
    this.path = join(this.directory, 'launcher.jsonl');
  }

  record(event: string, metadata: Metadata = {}) {
    try {
      if (this.size === undefined) {
        mkdirSync(this.directory, { recursive: true });
        try {
          this.size = statSync(this.path).size;
        } catch (error) {
          if (errorCode(error) !== 'ENOENT') throw error;
          this.size = 0;
        }
      }
      const details = Object.fromEntries(
        Object.entries(metadata).map(([key, value]) => [
          key,
          typeof value === 'string' ? value.slice(0, 160) : value,
        ]),
      );
      const line = `${JSON.stringify({ time: new Date().toISOString(), event, ...details })}\n`;
      const bytes = Buffer.byteLength(line);
      if (this.size + bytes > maximumSize) {
        renameSync(this.path, join(this.directory, 'launcher.previous.jsonl'));
        this.size = 0;
      }
      appendFileSync(this.path, line, 'utf8');
      this.size += bytes;
      this.failure = undefined;
    } catch (error) {
      // Logging must not abort a game or startup; the log entry point reports storage failures.
      this.failure = error;
      this.size = undefined;
    }
  }

  openDirectory() {
    this.record('logs.open');
    if (this.failure) throw this.failure;
    return this.directory;
  }
}

/** Compare snapshots without persisting any player data, configuration or task messages. */
export function observeRuntime(log: ApplicationLog) {
  let plugins = new Map<string, string>();
  let tasks = new Map<string, string>();
  let running = new Set<string>();
  let initialized = false;
  return (snapshot: LauncherSnapshot) => {
    for (const plugin of snapshot.plugins) {
      const state = `${plugin.version}:${plugin.status}`;
      if (plugins.get(plugin.id) !== state)
        log.record('plugin.state', {
          id: plugin.id,
          version: plugin.version,
          state: plugin.status,
        });
    }
    for (const id of plugins.keys())
      if (!snapshot.plugins.some((plugin) => plugin.id === id))
        log.record('plugin.removed', { id });
    for (const task of snapshot.tasks)
      if (tasks.get(task.id) !== task.status && (initialized || task.status === 'running'))
        log.record('task.state', { id: task.id, kind: task.kind, state: task.status });
    for (const id of snapshot.running) if (!running.has(id)) log.record('game.started', { id });
    for (const id of running)
      if (!snapshot.running.includes(id)) log.record('game.stopped', { id });
    plugins = new Map(
      snapshot.plugins.map((plugin) => [plugin.id, `${plugin.version}:${plugin.status}`]),
    );
    tasks = new Map(snapshot.tasks.map((task) => [task.id, task.status]));
    running = new Set(snapshot.running);
    initialized = true;
  };
}
