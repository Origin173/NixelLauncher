/** Migrate v0.1 display labels used as persisted identifiers. */
const legacyIds: Record<string, string> = {
  模组: 'mods',
  资源包: 'resourcepacks',
  光影: 'shaders',
  整合包: 'modpacks',
  Microsoft: 'microsoft',
  离线: 'offline',
  第三方: 'yggdrasil',
};
export const migrateIdentifier = (value: string) => legacyIds[value] ?? value;

/** Early local imports stored a translated placeholder in place of a version. */
export const migrateLocalVersion = (version: string) =>
  ['本地文件', 'Local file'].includes(version) ? '' : version;
