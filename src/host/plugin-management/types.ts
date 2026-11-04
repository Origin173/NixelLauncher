import type { Fiber, Plugin } from 'cordis';
import type { PluginItem } from '../../shared/contracts';
export interface InstalledPlugin {
  item: PluginItem;
  plugin?: Plugin;
  fiber?: Fiber;
}
