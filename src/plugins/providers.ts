import type {
  Account,
  Instance,
  Resource,
  ResourceDetails,
  ResourceQuery,
  ResourceVersion,
  ResourceVersionDetails,
  VersionEntry,
} from '../shared/contracts';
import type { TaskContext } from '../shared/host-api';
import type { GameSession } from './authentication';

export interface GameProvider {
  versions(signal?: AbortSignal): Promise<VersionEntry[]>;
  loaders(
    version: string,
    loader: Instance['loader'],
    signal?: AbortSignal,
  ): Promise<VersionEntry[]>;
  install(instance: Instance, task: TaskContext): Promise<string>;
  launch(instance: Instance, account: Account, task: TaskContext): Promise<void>;
  stop(id: string): void;
}
export interface AccountProvider {
  refresh(account: Account): Promise<Account>;
  session(account: Account, signal: AbortSignal): Promise<GameSession>;
}
export interface ResourceProvider {
  search(query: ResourceQuery, instance?: Instance): Promise<{ items: Resource[]; total: number }>;
  versions(
    projectId: string,
    instance?: Instance,
    signal?: AbortSignal,
  ): Promise<ResourceVersion[]>;
  /** Optional catalog extensions; existing providers can still search and install. */
  details?(projectId: string): Promise<ResourceDetails>;
  versionDetails?(projectId: string, versionId: string): Promise<ResourceVersionDetails>;
  install(
    projectId: string,
    versionId: string,
    instance: Instance | undefined,
    task: TaskContext,
  ): Promise<void>;
  checkUpdates(instance: Instance, task: TaskContext): Promise<void>;
}

export interface CurseForgePackFile {
  projectID: number;
  fileID: number;
  required?: boolean;
}
export interface CurseForgeResourceProvider extends ResourceProvider {
  prepareFiles(files: CurseForgePackFile[], signal: AbortSignal): Promise<void>;
  installFiles(files: CurseForgePackFile[], instance: Instance, task: TaskContext): Promise<void>;
}
