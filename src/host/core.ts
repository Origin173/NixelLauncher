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
import { i18n, localizeManifest, setLocale, tr } from '../shared/i18n';
import { migrateIdentifier, migrateLocalVersion } from '../shared/migrate-identifiers';
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
    setLocale(this.state.settings.locale);
    for (const item of this.state.content) {
      item.category = migrateIdentifier(item.category) as typeof item.category;
      if (!item.source && !item.projectId) item.version = migrateLocalVersion(item.version);
      // Legacy update labels do not identify an installable file; check again for its exact ID.
      if (typeof item.update === 'string') delete item.update;
    }
    for (const account of this.state.accounts)
      account.type = migrateIdentifier(account.type) as typeof account.type;
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
      setLocale(draft.settings.locale);
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
    if (this.handlers.has(name))
      throw new Error(tr('core.commandAlreadyRegisteredValue', { value1: name }));
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
    if (!entry)
      throw new Error(tr('core.commandUnavailableCheckThatItsPluginIs', { value1: name }));
    return (await commandOwner.run(entry.owner, () => entry.handler(params as never))) as T;
  }
}

class HostProviders implements ProviderRegistry {
  private entries = new Map<string, { descriptor: ProviderDescriptor; implementation: unknown }>();

  constructor(private changed: () => void) {}

  register<T>(ctx: Context, descriptor: ProviderDescriptor, implementation: T) {
    const key = `${descriptor.kind}:${descriptor.id}`;
    if (this.entries.has(key))
      throw new Error(tr('core.providerAlreadyRegisteredValue', { value1: descriptor.id }));
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
    if (!entry) throw new Error(tr('core.providerIsDisabledValue', { value1: id }));
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
    setLocale('system', this.configuration.systemLocale);
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
      plugins: this.pluginSnapshot.map((item) => {
        const manifest = localizeManifest(item.manifest);
        return {
          ...structuredClone(item),
          name: manifest.name,
          desc: manifest.description,
          category: manifest.category,
        };
      }),
      providers: this.providers.list().map((provider) => ({
        ...provider,
        name: provider.locales?.[i18n.language]?.name ?? provider.name,
      })),
      tasks: this.tasks.list(),
      running: [...this.running],
      host: { status: this.ready ? 'ready' : 'starting', pid: process.pid },
      appVersion: this.configuration.appVersion,
      dataDirectory: this.configuration.dataPath,
    };
  }
}
