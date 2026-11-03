import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { type UtilityProcess, utilityProcess } from 'electron';
import type {
  HostConfiguration,
  HostToMain,
  MainToHost,
  PlatformOperation,
} from '../host/protocol';

interface PendingCommand {
  resolve(value: unknown): void;
  reject(reason: Error): void;
}

export class HostClient {
  private child: UtilityProcess | undefined;
  private pending = new Map<string, PendingCommand>();
  private stopping = false;
  private stopPromise: Promise<void> | undefined;
  private readyPromise: Promise<void> | undefined;

  constructor(
    private readonly configuration: HostConfiguration,
    private readonly onSnapshot: (snapshot: unknown) => void,
    private readonly onStatus: (state: 'starting' | 'ready' | 'crashed', error?: string) => void,
    private readonly platform: (operation: PlatformOperation, payload: unknown) => Promise<unknown>,
  ) {}

  start() {
    if (this.child) return this.readyPromise;
    this.stopping = false;
    this.stopPromise = undefined;
    this.onStatus('starting');
    const child = utilityProcess.fork(join(__dirname, 'host.cjs'), [], {
      serviceName: 'Nixel Plugin Host',
      stdio: 'inherit',
    });
    this.child = child;
    let resolveReady: () => void;
    let rejectReady: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    this.readyPromise = ready;
    // Initial startup reports errors through onStatus; restart also awaits this promise.
    void ready.catch(() => {});
    child.on('message', (message: HostToMain) => {
      if (this.child !== child) return;
      switch (message.type) {
        case 'ready':
          this.onStatus('ready');
          resolveReady();
          break;
        case 'snapshot':
          if (!this.stopping) this.onSnapshot(message.snapshot);
          break;
        case 'fatal':
          this.onStatus('crashed', message.error);
          rejectReady(new Error(message.error));
          break;
        case 'command-result': {
          const pending = this.pending.get(message.id);
          if (!pending) break;
          this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(message.error));
          else pending.resolve(message.value);
          break;
        }
        case 'platform':
          void this.platform(message.operation, message.payload).then(
            (value) => {
              if (this.child === child)
                child.postMessage({ type: 'platform-result', id: message.id, value });
            },
            (error: unknown) => {
              if (this.child === child)
                child.postMessage({
                  type: 'platform-result',
                  id: message.id,
                  error: String(error),
                });
            },
          );
      }
    });
    child.on('exit', (code) => {
      if (this.child !== child) return;
      this.child = undefined;
      const error = new Error(`插件 Host 已退出（${code}），请重启 Host 后重试。`);
      rejectReady(error);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      if (!this.stopping) this.onStatus('crashed', error.message);
    });
    child.postMessage({
      type: 'initialize',
      configuration: this.configuration,
    } satisfies MainToHost);
    return ready;
  }

  private send(message: MainToHost) {
    this.child?.postMessage(message);
  }

  command(command: string, payload?: unknown): Promise<unknown> {
    if (!this.child) return Promise.reject(new Error('插件 Host 尚未运行。'));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ type: 'command', id, command, payload });
    });
  }

  stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopping = true;
    const child = this.child;
    if (!child) return Promise.resolve();
    this.stopPromise = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => child.kill(), 3_000);
      timeout.unref();
      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
      this.send({ type: 'shutdown' });
    });
    return this.stopPromise;
  }

  async restart() {
    this.onStatus('starting');
    await this.stop();
    await this.start();
  }
}
