import type { InstanceVersionTarget } from './contracts';
export interface PackProvenance {
  source: string;
  projectId: string;
  versionId: string;
}
export interface PackFileRecord {
  path: string;
  sha256: string;
}
export interface ModpackState {
  format: 'modrinth' | 'curseforge';
  name: string;
  version: string;
  provenance?: PackProvenance;
  manifest: unknown;
  files: PackFileRecord[];
}
export interface ModpackUpgradeTarget {
  id: string;
  path?: string;
  versionId?: string;
  /** Online preparation retries stay bound to the original project and provider. */
  source?: Pick<PackProvenance, 'source' | 'projectId'>;
}
export interface ModpackFileChange {
  path: string;
  action: 'add' | 'replace' | 'remove' | 'keep' | 'conflict';
  currentHash?: string;
  disabledHash?: string;
  nextHash?: string;
  protected: boolean;
}
export interface ModpackUpgradePlan {
  id: string;
  instanceId: string;
  name: string;
  version: string;
  target: InstanceVersionTarget;
  fingerprint: string;
  changes: ModpackFileChange[];
}
export interface ModpackUpgradeInput {
  id: string;
  planId: string;
  fingerprint: string;
  choices: Record<string, 'keep' | 'replace'>;
}
