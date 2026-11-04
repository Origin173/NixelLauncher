import type { Context } from 'cordis';
import type { NixelPluginManifest } from './contracts';

export type PluginConfigSchema = Record<string, unknown>;
export interface PluginPackage {
  manifest: NixelPluginManifest;
  url: string;
  sha256: string;
}
export interface PluginCatalog {
  formatVersion: 1;
  packages: PluginPackage[];
}
export interface PluginRelease {
  directory: string;
  version: string;
  source: string;
  sha256: string;
}
export interface ManagedPlugin {
  current: PluginRelease;
  previous?: PluginRelease & { config: Record<string, unknown> };
}
export interface PluginInstallPreview {
  source: string;
  package: PluginPackage;
  installedVersion?: string;
  config: Record<string, unknown>;
  problems: string[];
}
/** Host-only lifecycle capability. Context and running task identity are verified internally. */
export interface PluginManager {
  inspect(manifest: NixelPluginManifest): string[];
  installManaged(ctx: Context, directory: string, preview: PluginInstallPreview): Promise<void>;
  rollback(ctx: Context, target: PluginRollbackTarget): Promise<void>;
}
export interface PluginRollbackTarget {
  id: string;
  current: string;
  previous: string;
}
