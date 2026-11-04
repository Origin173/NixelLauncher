import type { Context, Plugin } from 'cordis';
import type {
  LauncherSnapshot,
  NixelPluginManifest,
  PersistedState,
  ProviderDescriptor,
  ProviderKind,
  Task,
} from './contracts';
import type { NetworkConfiguration } from './network';
import type { PluginManager } from './plugin-distribution';

export interface StateStore {
  root: string;
  instancesRoot: string;
  cacheRoot: string;
  read(): PersistedState;
  update(mutate: (draft: PersistedState) => void): Promise<void>;
}
export interface CommandRegistry {
  register<P = void, R = unknown>(
    ctx: Context,
    name: string,
    handler: (params: P) => R | Promise<R>,
  ): () => void;
  invoke<T = unknown>(name: string, params?: unknown): Promise<T>;
}
export interface ProviderRegistry {
  register<T>(ctx: Context, descriptor: ProviderDescriptor, implementation: T): () => void;
  get<T>(kind: ProviderKind, id: string): T;
  list(): ProviderDescriptor[];
}
export interface TaskContext {
  readonly taskId: string;
  signal: AbortSignal;
  /** Associate an instance created during this task, e.g. a modpack import. */
  setInstance(id: string): void;
  report(progress: number, detail?: string): void;
  log(line: string): void;
  setControls(controls?: { pause(): void; resume(): void }): void;
  setActivity(activity?: 'paused' | 'queued'): void;
}
export interface TaskManager {
  start(
    name: string,
    detail: string,
    run: (task: TaskContext) => Promise<void>,
    context?: {
      instanceId?: string;
      resourceId?: string;
      resourceSource?: string;
      kind?: string;
      retry?: Task['retry'];
    },
  ): string;
  list(): Task[];
  cancel(id: string): void;
  pause(id: string): void;
  resume(id: string): void;
  retry(id: string): Promise<string>;
  clear(): void;
}
export interface HostPlatform {
  configureProxy(config: NetworkConfiguration): Promise<void>;
  resolveProxy(url: string): Promise<string>;
  secretGet(key: string): Promise<string | null>;
  secretSet(key: string, value: string): Promise<void>;
  secretDelete(key: string): Promise<void>;
  openExternal(url: string): Promise<void>;
}
export interface NixelHost {
  plugins: PluginManager;
  store: StateStore;
  commands: CommandRegistry;
  providers: ProviderRegistry;
  tasks: TaskManager;
  platform: HostPlatform;
  running: Set<string>;
  changed(): void;
  snapshot(): LauncherSnapshot;
}
export interface BuiltinPlugin {
  manifest: NixelPluginManifest;
  plugin?: Plugin;
}
declare module 'cordis' {
  interface Context {
    nixel: NixelHost;
  }
}
