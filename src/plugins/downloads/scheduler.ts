import { resolve } from 'node:path';
import { defaultDownloadMirror } from '../../shared/download-mirrors';
import type { DownloadConfiguration, DownloadRequest } from '../../shared/downloads';
import type { TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { routeDownload } from './mirrors/routing';
import { discardPartial, partialPaths } from './partial';
import { DownloadRateLimit } from './rate-limit';
import { transferDownload } from './transfer';

class DownloadGroup {
  paused = false;
  pending = 0;
  active = 0;
  interrupt = new AbortController();
  private listeners = new Set<() => void>();

  constructor(readonly task: TaskContext) {
    task.setControls({ pause: () => this.pause(), resume: () => this.resume() });
  }
  update() {
    this.task.setActivity(this.paused ? 'paused' : this.active ? undefined : 'queued');
  }
  private pause() {
    if (this.paused) return;
    this.paused = true;
    this.interrupt.abort();
    this.task.log(tr('downloads.pausedLog'));
    this.update();
  }
  private resume() {
    if (!this.paused) return;
    this.paused = false;
    this.interrupt = new AbortController();
    for (const wake of [...this.listeners]) wake();
    this.task.log(tr('downloads.resumedLog'));
    this.update();
  }
  async wait(signal: AbortSignal) {
    signal.throwIfAborted();
    if (!this.paused) return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.listeners.delete(wake);
        signal.removeEventListener('abort', abort);
      };
      const wake = () => {
        cleanup();
        resolve();
      };
      const abort = () => {
        cleanup();
        reject(signal.reason);
      };
      this.listeners.add(wake);
      signal.addEventListener('abort', abort, { once: true });
    });
  }
}

interface QueuedDownload {
  owner: symbol;
  target: string;
  group: DownloadGroup;
  signal: AbortSignal;
  start: (release: () => void) => void;
  abort: () => void;
}

export class DownloadScheduler {
  private readonly sources = new WeakMap<TaskContext, Set<string>>();
  private readonly groups = new Map<string, DownloadGroup>();
  private readonly queue: QueuedDownload[] = [];
  private readonly activeTargets = new Set<string>();
  private readonly owners = new Map<string, symbol>();
  private readonly runs = new Set<Promise<void>>();
  private readonly shutdown = new AbortController();
  private readonly rate: DownloadRateLimit;

  constructor(
    private readonly cache: string,
    private readonly config: DownloadConfiguration,
  ) {
    this.rate = new DownloadRateLimit(config.bytesPerSecond);
  }

  download(request: DownloadRequest, task: TaskContext) {
    const run = this.execute(request, task);
    this.runs.add(run);
    void run.then(
      () => this.runs.delete(run),
      () => this.runs.delete(run),
    );
    return run;
  }

  private async execute(request: DownloadRequest, task: TaskContext) {
    const route = routeDownload(request, this.config.mirror ?? defaultDownloadMirror);
    if (route) {
      const sources = this.sources.get(task) ?? new Set<string>();
      this.sources.set(task, sources);
      const sourceKey = `${route.source}:${route.category}`;
      if (!sources.has(sourceKey)) {
        sources.add(sourceKey);
        task.log(
          tr('mirrors.sourceLog', {
            source: route.source === 'official' ? tr('mirrors.official') : route.source,
            category: tr(`mirrors.${route.category}`),
          }),
        );
      }
      request = { ...request, url: route.url };
    }
    let group = this.groups.get(task.taskId);
    if (!group) {
      group = new DownloadGroup(task);
      this.groups.set(task.taskId, group);
    }
    group.pending++;
    group.update();
    const cancelled = AbortSignal.any([request.signal, this.shutdown.signal]);
    const path = resolve(request.target);
    const target = process.platform === 'win32' ? path.toLowerCase() : path;
    const owner = Symbol(target);
    try {
      while (true) {
        await group.wait(cancelled);
        const interruption = group.interrupt.signal;
        const signal = AbortSignal.any([cancelled, interruption]);
        let release: (() => void) | undefined;
        try {
          release = await this.acquire(target, owner, group, signal);
          await transferDownload({ ...request, signal }, this.cache, this.rate, task.log);
          release();
          release = undefined;
          // Pause arriving during verification/commit still holds this task at the download boundary.
          await group.wait(cancelled);
          return;
        } catch (error) {
          if (cancelled.aborted) throw cancelled.reason;
          if (!interruption.aborted) throw error;
        } finally {
          release?.();
        }
      }
    } catch (error) {
      if (cancelled.aborted && (!this.owners.has(target) || this.owners.get(target) === owner))
        await discardPartial(partialPaths(this.cache, request.target));
      throw error;
    } finally {
      if (this.owners.get(target) === owner) this.owners.delete(target);
      this.pump();
      group.pending--;
      if (!group.pending) {
        task.setControls(undefined);
        this.groups.delete(task.taskId);
      } else group.update();
    }
  }

  private acquire(target: string, owner: symbol, group: DownloadGroup, signal: AbortSignal) {
    signal.throwIfAborted();
    return new Promise<() => void>((start, reject) => {
      const entry: QueuedDownload = {
        target,
        owner,
        group,
        signal,
        start,
        abort: () => {
          const index = this.queue.indexOf(entry);
          if (index >= 0) this.queue.splice(index, 1);
          reject(signal.reason);
        },
      };
      this.queue.push(entry);
      signal.addEventListener('abort', entry.abort, { once: true });
      this.pump();
    });
  }

  private pump() {
    while (this.activeTargets.size < this.config.concurrency) {
      const index = this.queue.findIndex(
        (entry) =>
          !this.activeTargets.has(entry.target) &&
          (!this.owners.has(entry.target) || this.owners.get(entry.target) === entry.owner),
      );
      if (index < 0) return;
      const entry = this.queue.splice(index, 1)[0];
      if (!entry) return;
      entry.signal.removeEventListener('abort', entry.abort);
      this.activeTargets.add(entry.target);
      this.owners.set(entry.target, entry.owner);
      entry.group.active++;
      entry.group.update();
      entry.start(() => {
        this.activeTargets.delete(entry.target);
        entry.group.active--;
        entry.group.update();
        this.pump();
      });
    }
  }

  async dispose() {
    this.shutdown.abort();
    await Promise.allSettled(this.runs);
  }
}
