import type { Context } from 'cordis';
import { registerCatalog } from '../catalog/commands';
import { registerContentFiles } from './commands';
import { registerContentImport } from './import';
import { registerContentUpdates } from './updates';
export const contentPlugin = {
  name: 'nixel.resources',
  inject: ['nixel'],
  apply(ctx: Context) {
    registerCatalog(ctx);
    registerContentFiles(ctx);
    registerContentImport(ctx);
    registerContentUpdates(ctx);
  },
};
