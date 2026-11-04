import type { LaunchOption } from '@xmcl/core';
import type {
  Account,
  Instance,
  Resource,
  ResourceQuery,
  ResourceVersion,
  VersionEntry,
} from '../shared/contracts';
import type { TaskContext } from '../shared/host-api';

export interface GameProvider {
  versions(): Promise<VersionEntry[]>;
  loaders(version: string, loader: Instance['loader']): Promise<VersionEntry[]>;
  install(instance: Instance, task: TaskContext): Promise<string>;
  launch(instance: Instance, account: Account, task: TaskContext): Promise<void>;
  stop(id: string): void;
}
export interface AccountProvider {
  refresh(account: Account): Promise<Account>;
  session(
    account: Account,
    signal: AbortSignal,
  ): Promise<Pick<LaunchOption, 'accessToken' | 'gameProfile' | 'yggdrasilAgent' | 'userType'>>;
}
export interface ResourceProvider {
  search(query: ResourceQuery, instance?: Instance): Promise<{ items: Resource[]; total: number }>;
  versions(projectId: string, instance?: Instance): Promise<ResourceVersion[]>;
  install(
    projectId: string,
    versionId: string,
    instance: Instance | undefined,
    task: TaskContext,
  ): Promise<void>;
  checkUpdates(instance: Instance, task: TaskContext): Promise<void>;
}
