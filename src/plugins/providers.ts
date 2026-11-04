import type {
  Account,
  InstalledContent,
  Instance,
  Resource,
  ResourceDetails,
  ResourceInstallOptions,
  ResourceOptionalDependency,
  ResourceQuery,
  ResourceVersion,
  ResourceVersionDetails,
  VersionEntry,
} from '../shared/contracts';
import type { TaskContext } from '../shared/host-api';
import type { GameLaunchOptions } from '../shared/servers';
import type { AccountAppearance, SkinModel } from '../shared/skins';
import type { VersionContentRoot } from '../shared/version-content';
import type { GameSession } from './authentication';
import type { ContentDownload } from './resource-files';

export interface GameProvider {
  versions(signal?: AbortSignal): Promise<VersionEntry[]>;
  loaders(
    version: string,
    loader: Instance['loader'],
    signal?: AbortSignal,
  ): Promise<VersionEntry[]>;
  install(instance: Instance, task: TaskContext): Promise<string>;
  launch(
    instance: Instance,
    account: Account,
    task: TaskContext,
    options?: GameLaunchOptions,
  ): Promise<void>;
  stop(id: string): void;
}
export interface AccountProvider {
  appearance?: {
    profile(account: Account, signal: AbortSignal): Promise<AccountAppearance>;
    upload(account: Account, png: Uint8Array, model: SkinModel, signal: AbortSignal): Promise<void>;
    reset(account: Account, signal: AbortSignal): Promise<void>;
    cape(account: Account, id: string | null, signal: AbortSignal): Promise<void>;
  };
  refresh(account: Account): Promise<Account>;
  session(account: Account, signal: AbortSignal): Promise<GameSession>;
}
export interface ResourceProvider {
  planInstall?(
    roots: VersionContentRoot[],
    instance: Instance,
    retained: InstalledContent[],
    signal?: AbortSignal,
    options?: { pinRetained?: boolean },
  ): Promise<ContentDownload[]>;
  downloadModpack?(projectId: string, versionId: string, task: TaskContext): Promise<string>;
  search(query: ResourceQuery, instance?: Instance): Promise<{ items: Resource[]; total: number }>;
  versions(
    projectId: string,
    instance?: Instance,
    signal?: AbortSignal,
  ): Promise<ResourceVersion[]>;
  /** Optional catalog extensions; existing providers can still search and install. */
  details?(projectId: string): Promise<ResourceDetails>;
  versionDetails?(projectId: string, versionId: string): Promise<ResourceVersionDetails>;
  optionalDependencies?(
    projectId: string,
    versionId: string,
    instance: Instance,
  ): Promise<ResourceOptionalDependency[]>;
  install(
    projectId: string,
    versionId: string,
    instance: Instance | undefined,
    task: TaskContext,
    options?: ResourceInstallOptions,
  ): Promise<void>;
  checkUpdates(instance: Instance, task: TaskContext): Promise<void>;
}

export interface CurseForgePackFile {
  projectID: number;
  fileID: number;
  required?: boolean;
}
export interface CurseForgeResourceProvider extends ResourceProvider {
  resolvePackFiles(
    files: CurseForgePackFile[],
    instance: Instance,
    signal: AbortSignal,
  ): Promise<ContentDownload[]>;
  prepareFiles(files: CurseForgePackFile[], signal: AbortSignal): Promise<void>;
  installFiles(files: CurseForgePackFile[], instance: Instance, task: TaskContext): Promise<void>;
}
