export type Page = 'home' | 'instances' | 'resources' | 'plugins' | 'accounts' | 'settings';
export type Loader = 'Vanilla' | 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt';
export type ContentCategory = 'mods' | 'resourcepacks' | 'shaders';
export type ProviderKind = 'game' | 'resources' | 'accounts' | 'interface';

export interface InstanceVersionTarget {
  version: string;
  loader: Loader;
  loaderVersion?: string;
}
export interface VersionContentReview {
  id: string;
  name: string;
  fileName: string;
  icon?: string;
  category: ContentCategory;
  enabled: boolean;
  source?: string;
  status: 'compatible' | 'update-available' | 'incompatible' | 'unknown';
  reason?: string;
}
export interface InstanceVersionPlan {
  target: InstanceVersionTarget;
  fingerprint: string;
  content: VersionContentReview[];
}
export interface ChangeInstanceVersionInput {
  id: string;
  target: InstanceVersionTarget;
  fingerprint: string;
  acceptRisks: boolean;
}

export interface Instance {
  id: string;
  name: string;
  version: string;
  loader: Loader;
  loaderVersion?: string;
  launchVersion?: string;
  directory: string;
  status: 'not-installed' | 'installing' | 'ready' | 'error';
  error?: string;
  account: string;
  /** MiB; null inherits the global memory limit. */
  memory: number | null;
  javaPath: string;
  jvmArgs?: string[] | null;
  gameArgs?: string[] | null;
  resolution?: { width: number; height: number } | null;
  fullscreen?: boolean | null;
  pendingOperation?: { taskId: string; root: string };
  providers: { game: string; resources: string; accounts: string };
  providerConfig: Record<string, Record<string, unknown>>;
  createdAt: string;
  lastPlayed?: string;
  playTime: number;
  color: string;
  kind: string;
  hours: string;
}
export interface Account {
  id: string;
  name: string;
  uuid: string;
  type: 'microsoft' | 'offline' | 'yggdrasil';
  provider: string;
  color: string;
  detail: string;
  authServer?: string;
  expiresAt?: number;
}
export interface InstalledContent {
  icon?: string;
  id: string;
  instance: string;
  name: string;
  version: string;
  category: ContentCategory;
  fileName: string;
  enabled: boolean;
  color: string;
  projectId?: string;
  versionId?: string;
  source?: string;
  update?: { versionId: string; version: string };
}
export interface ContentUpdateTarget {
  source: string;
  projectId: string;
  versionId: string;
}
export interface Resource {
  id: string;
  name: string;
  author: string;
  desc: string;
  category: ContentCategory | 'modpacks';
  source: string;
  downloads: string;
  version: string;
  color: string;
  icon?: string;
  url?: string;
}
export interface ResourceVersion {
  id: string;
  name: string;
  version: string;
  gameVersions: string[];
  loaders: string[];
  publishedAt: string;
}
export interface ResourceDocument {
  content: string;
  format: 'markdown' | 'html';
}
export interface ResourceDetails {
  description: ResourceDocument;
  gallery: { url: string; title?: string; description?: string }[];
  url: string;
}
export interface ResourceDependency {
  projectId?: string;
  versionId?: string;
  name: string;
  type: 'required' | 'optional' | 'incompatible' | 'embedded' | 'tool' | 'include' | 'unknown';
  url?: string;
}
export interface ResourceVersionDetails {
  changelog: ResourceDocument;
  dependencies: ResourceDependency[];
}
export interface VersionEntry {
  id: string;
  type: string;
  releaseTime?: string;
}
export interface JavaRuntime {
  path: string;
  version: string;
  major: number;
}
export interface InstanceFile {
  name: string;
  path: string;
  modifiedAt: string;
  size?: number;
}
export interface InstanceBackup {
  /** Absent on older backups, which are preserved as manual backups. */
  origin?: 'manual' | 'version-change';
  id: string;
  instanceId: string;
  instanceName: string;
  createdAt: string;
  version: string;
  loader: Loader;
  size: number;
  files: number;
}
export interface Task {
  id: string;
  name: string;
  detail: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  kind: string;
  logs: string[];
  error?: string;
  instanceId?: string;
  resourceId?: string;
  resourceSource?: string;
  createdAt: string;
  finishedAt?: string;
  /** Replays a command against the currently enabled plugins; never contains credentials. */
  retry?: { command: string; params: Record<string, unknown> };
}
export interface ProviderDescriptor {
  locales?: Record<string, { name: string }>;
  id: string;
  pluginId: string;
  kind: ProviderKind;
  name: string;
  capabilities?: string[];
}
export interface NixelPluginManifest {
  locales?: Record<string, Partial<Pick<NixelPluginManifest, 'name' | 'description' | 'category'>>>;
  id: string;
  name: string;
  version: string;
  description: string;
  apiVersion: 1;
  main?: string;
  renderer?: string;
  category: string;
  author?: string;
  dependencies?: string[];
}
export interface PluginItem {
  id: string;
  name: string;
  version: string;
  desc: string;
  category: string;
  enabled: boolean;
  installed: boolean;
  builtin: boolean;
  official: boolean;
  status: 'active' | 'disabled' | 'error';
  error?: string;
  directory?: string;
  color: string;
  config: Record<string, unknown>;
  manifest: NixelPluginManifest;
}
export interface LauncherSettings {
  locale: 'system' | 'zh-CN' | 'en-US';
  theme: 'light' | 'dark' | 'system';
  motion: boolean;
  background: string;
  dim: number;
  /** MiB. The default is 4096. */
  memory: number;
  javaPath: string;
  autoDownloadJava: boolean;
  jvmArgs: string[];
  gameArgs: string[];
  resolution: { width: number; height: number };
  fullscreen: boolean;
  instanceDirectory: string;
  defaultAccount: string;
  launchInstance: string;
  launchAccount: string;
  interfacePlugin: string;
  downloadConcurrency: number;
  /** Newest automatic backups per instance; 0 keeps all. Manual backups are always kept. */
  backupRetentionCount: number;
  closeAfterLaunch: boolean;
  setupComplete: boolean;
  providers: { game: string; resources: string; accounts: string };
}
export interface PersistedState {
  schemaVersion: 1;
  instances: Instance[];
  accounts: Account[];
  content: InstalledContent[];
  settings: LauncherSettings;
  plugins: Record<
    string,
    { enabled: boolean; directory?: string; config: Record<string, unknown> }
  >;
}
export interface LauncherSnapshot {
  instances: Instance[];
  accounts: Account[];
  content: InstalledContent[];
  settings: LauncherSettings;
  plugins: PluginItem[];
  providers: ProviderDescriptor[];
  tasks: Task[];
  running: string[];
  host: { status: 'starting' | 'ready' | 'error' | 'stopped'; error?: string; pid?: number };
  appVersion: string;
  dataDirectory: string;
}
export interface DeviceLogin {
  id: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  interval: number;
}
export interface ResourceQuery {
  query: string;
  category: string;
  source?: string;
  instanceId?: string;
  sort?: string;
  offset?: number;
}
export interface ResourceSearchResult {
  items: Resource[];
  total: number;
  /** Offset is per provider; aggregated pages interleave up to 20 items from each source. */
  hasMore: boolean;
  warnings: { source: string; message: string }[];
}
export interface CreateInstanceInput {
  name: string;
  version: string;
  loader: Loader;
  loaderVersion?: string;
  install?: boolean;
}
export interface PathOptions {
  kind: 'file' | 'directory' | 'save';
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}
export interface NixelBridge {
  platform: string;
  getSnapshot(): Promise<LauncherSnapshot>;
  invoke<T = unknown>(command: string, params?: unknown): Promise<T>;
  onState(listener: (state: LauncherSnapshot) => void): () => void;
  selectPath(options: PathOptions): Promise<string | null>;
  selectFiles(options: Omit<PathOptions, 'kind'>): Promise<string[]>;
  openPath(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  readImage(path: string): Promise<string>;
  windowControl(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
  restartHost(): Promise<void>;
}
