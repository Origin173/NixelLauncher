import type { Context } from 'cordis';
import { registerJavaCommands } from '../java-commands';
import { registerLocalInstances } from '../local-instances';
import { registerModpacks } from '../modpacks';
import { cleanupPendingInstances } from '../pending-instances';
import { registerBackups } from './backups';
import { BackupRepository } from './backups/repository';
import { registerInstanceFiles } from './files';
import { registerInstanceLaunch } from './launch';
import { registerInstanceManagement } from './manage';
import { registerVersionManagement } from './versions';

export const instancesPlugin = {
  name: 'nixel.instances',
  inject: ['nixel'],
  async apply(ctx: Context) {
    await cleanupPendingInstances(ctx.nixel);
    const backups = new BackupRepository(ctx.nixel.store.root);
    await backups.initialize();
    registerBackups(ctx, backups);
    registerVersionManagement(ctx, backups);
    registerInstanceManagement(ctx);
    registerInstanceLaunch(ctx);
    registerInstanceFiles(ctx);
    registerJavaCommands(ctx);
    registerModpacks(ctx);
    registerLocalInstances(ctx);
  },
};
