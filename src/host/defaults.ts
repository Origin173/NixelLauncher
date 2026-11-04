import { join } from 'node:path';
import type { PersistedState } from '../shared/contracts';

export function defaultState(root: string): PersistedState {
  return {
    schemaVersion: 1,
    instances: [],
    accounts: [],
    content: [],
    plugins: {},
    settings: {
      locale: 'system',
      theme: 'system',
      motion: true,
      background: 'alpine',
      dim: 0,
      memory: 4096,
      javaPath: '',
      autoDownloadJava: true,
      jvmArgs: [],
      gameArgs: [],
      resolution: { width: 854, height: 480 },
      fullscreen: false,
      instanceDirectory: join(root, 'instances'),
      defaultAccount: '',
      launchInstance: '',
      launchAccount: '',
      interfacePlugin: 'nixel.ui.default',
      downloadConcurrency: 8,
      backupRetentionCount: 0,
      closeAfterLaunch: false,
      setupComplete: false,
      providers: {
        game: 'nixel.game.minecraft',
        resources: 'nixel.resources.modrinth',
        accounts: 'nixel.accounts.offline',
      },
    },
  };
}
