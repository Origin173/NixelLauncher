import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type Context, Service } from 'cordis';
import type {
  LauncherSnapshot,
  PersistedState,
  ProviderDescriptor,
  ProviderKind,
} from '../shared/contracts';
import type {
  CommandRegistry,
  HostPlatform,
  NixelHost,
  ProviderRegistry,
  StateStore,
} from '../shared/host-api';
import { defaultState } from './defaults';
import type { HostConfiguration } from './protocol';
import { JsonStorage } from './storage';
import { commandOwner, HostTasks } from './tasks';

class HostStore implements StateStore {
  readonly cacheRoot: string;
  private state: PersistedState;
  private pending = Promise.resolve();

  constructor(
    readonly root: string,
    private storage: JsonStorage,
    private changed: () => void,
  ) {
    this.cacheRoot = join(root, 'cache');
    this.state = defaultState(root);
  }

  get instancesRoot() {
    return this.state.settings.instanceDirectory;
  }

  async load() {
    this.state = await this.storage.read('state', this.state);
    this.state.settings = { ...defaultState(this.root).settings, ...this.state.settings };
    if ('microsoftClientId' in this.state.settings) {
      delete this.state.settings.microsoftClientId;
    }
    await this.storage.write('state', this.state);
    await Promise.all([
      mkdir(this.root, { recursive: true }),
      mkdir(this.cacheRoot, { recursive: true }),
      mkdir(this.instancesRoot, { recursive: true }),
    ]);
  }

  read() {
    return structuredClone(this.state);
  }

  update(mutate: (draft: PersistedState) => void) {
    const update = this.pending.then(async () => {
      const draft = structuredClone(this.state);
      mutate(draft);
      await this.storage.write('state', draft);
      this.state = draft;
      this.changed();
    });
    this.pending = update.catch(() => {});
    return update;
  }
}

class HostCommands implements CommandRegistry {
  private handlers = new Map<string, { owner: Context; handler: (params: never) => unknown }>();

  constructor(private tasks: HostTasks) {}

  register<P = void, R = unknown>(
    ctx: Context,
    name: string,
    handler: (params: P) => R | Promise<R>,
  ) {
    if (this.handlers.has(name)) throw new Error(`命令已注册：${name}`);
    const entry = { owner: ctx, handler: handler as (params: never) => unknown };
    return ctx.effect(() => {
      this.handlers.set(name, entry);
      return async () => {
        this.handlers.delete(name);
        await this.tasks.disposeOwner(ctx);
      };
    });
  }

  async invoke<T = unknown>(name: string, params?: unknown): Promise<T> {
    const entry = this.handlers.get(name);
    if (!entry) throw new Error(`命令不可用，请检查对应插件是否启用：${name}`);
    return (await commandOwner.run(entry.owner, () => entry.handler(params as never))) as T;
  }
}

class HostProviders implements ProviderRegistry {
  private entries = new Map<string, { descriptor: ProviderDescriptor; implementation: unknown }>();

  constructor(private changed: () => void) {}

  register<T>(ctx: Context, descriptor: ProviderDescriptor, implementation: T) {
    const key = `${descriptor.kind}:${descriptor.id}`;
    if (this.entries.has(key)) throw new Error(`服务提供者已注册：${descriptor.id}`);
    return ctx.effect(() => {
      this.entries.set(key, { descriptor, implementation });
      this.changed();
      return () => {
        this.entries.delete(key);
        this.changed();
      };
    });
  }

  get<T>(kind: ProviderKind, id: string): T {
    const entry = this.entries.get(`${kind}:${id}`);
    if (!entry) throw new Error(`服务提供者未启用：${id}`);
    return entry.implementation as T;
  }

  list() {
    return [...this.entries.values()].map(({ descriptor }) => ({ ...descriptor }));
  }
}

export class NixelService extends Service implements NixelHost {
  readonly store: HostStore;
  readonly commands: HostCommands;
  readonly providers: HostProviders;
  readonly tasks: HostTasks;
  readonly running = new Set<string>();
  pluginSnapshot: LauncherSnapshot['plugins'] = [];
  private initialized = false;
  ready = false;
  private queued = false;

  constructor(
    ctx: Context,
    readonly configuration: HostConfiguration,
    readonly platform: HostPlatform,
    private publish: (snapshot: LauncherSnapshot) => void,
  ) {
    super(ctx, 'nixel');
    const storage = new JsonStorage(configuration.dataPath);
    this.tasks = new HostTasks(
      storage,
      () => this.changed(),
      (command, params) => this.commands.invoke<{ taskId: string }>(command, params),
    );
    this.store = new HostStore(configuration.dataPath, storage, () => this.changed());
    this.commands = new HostCommands(this.tasks);
    this.providers = new HostProviders(() => this.changed());
  }

  async initialize() {
    await this.store.load();
    await this.tasks.load();
    this.initialized = true;
  }

  changed() {
    if (!this.initialized || this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      this.publish(this.snapshot());
    });
  }

  snapshot(): LauncherSnapshot {
    const state = this.store.read();
    return {
      ...state,
      plugins: structuredClone(this.pluginSnapshot),
      providers: this.providers.list(),
      tasks: this.tasks.list(),
      running: [...this.running],
      host: { status: this.ready ? 'ready' : 'starting', pid: process.pid },
      appVersion: this.configuration.appVersion,
      dataDirectory: this.configuration.dataPath,
    };
  }
}
