import type { ContentCategory, Instance } from '../../shared/contracts';
import type { ProjectVersion } from './client';
export const resourcesId = 'nixel.resources.modrinth';
export const categories: Record<string, ContentCategory | 'modpacks'> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaders',
  modpack: 'modpacks',
};
export const projectTypes: Record<string, string> = {
  mods: 'mod',
  resourcepacks: 'resourcepack',
  shaders: 'shader',
  modpacks: 'modpack',
};
export const compatible = (version: ProjectVersion, instance: Instance) =>
  version.game_versions.includes(instance.version) &&
  (version.loaders.some((loader) => ['minecraft', 'iris', 'optifine'].includes(loader)) ||
    version.loaders.includes(instance.loader.toLowerCase()));
export const versionOptions = (instance?: Instance) =>
  instance
    ? {
        gameVersions: [instance.version],
        loaders:
          instance.loader === 'Vanilla'
            ? ['minecraft', 'iris', 'optifine']
            : [instance.loader.toLowerCase(), 'minecraft', 'iris', 'optifine'],
      }
    : {};
