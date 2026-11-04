export const appUpdatesId = 'nixel.app-updates';
export type AppUpdateAction = 'status' | 'check' | 'download' | 'cancel' | 'install';
export interface AppUpdateState {
  availability:
    | 'ready'
    | 'unconfigured'
    | 'invalidConfiguration'
    | 'development'
    | 'portable'
    | 'manual'
    | 'publisherRequired';
  phase:
    | 'idle'
    | 'checking'
    | 'current'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'installing'
    | 'error';
  currentVersion: string;
  releaseUrl?: string;
  version?: string;
  notes?: string;
  downloaded?: { version: string; notes?: string };
  installRestartRequired?: boolean;
  progress?: { percent: number; transferred: number; total: number; bytesPerSecond: number };
  error?: string;
  checkedAt?: string;
}
