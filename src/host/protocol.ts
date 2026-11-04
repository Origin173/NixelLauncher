export interface HostConfiguration {
  systemLocale?: string;
  dataPath: string;
  appVersion: string;
  rendererPath: string;
}

export type PlatformOperation =
  | 'appUpdates'
  | 'network.configure'
  | 'network.resolveProxy'
  | 'directory.select'
  | 'plugin.select'
  | 'path.open'
  | 'url.open'
  | 'secret.get'
  | 'secret.set'
  | 'secret.delete'
  | 'ui.load';

export type MainToHost =
  | { type: 'initialize'; configuration: HostConfiguration }
  | { type: 'command'; id: string; command: string; payload: unknown }
  | { type: 'platform-result'; id: string; value?: unknown; error?: string }
  | { type: 'shutdown' };

export type HostToMain =
  | { type: 'ready' }
  | { type: 'snapshot'; snapshot: unknown }
  | { type: 'command-result'; id: string; value?: unknown; error?: string }
  | { type: 'platform'; id: string; operation: PlatformOperation; payload: unknown }
  | { type: 'fatal'; error: string };
