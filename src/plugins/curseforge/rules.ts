import type { ContentCategory, Instance } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import type { CurseForgeFile, CurseForgeProject } from './models';
export const curseforgeId = 'nixel.resources.curseforge';
export type Category = ContentCategory | 'modpacks';
export const loaderTypes: Record<Instance['loader'], number> = {
  Vanilla: 0,
  Forge: 1,
  Fabric: 4,
  Quilt: 5,
  NeoForge: 6,
};
export const classSlugs: Record<Category, string[]> = {
  mods: ['mc-mods', 'mods'],
  modpacks: ['modpacks'],
  resourcepacks: ['texture-packs', 'resource-packs'],
  shaders: ['shaders', 'shader-packs'],
};
export const sortFields: Record<string, number> = {
  relevance: 2,
  downloads: 6,
  follows: 2,
  newest: 11,
  updated: 3,
};
export const loaderNames = new Set([
  'forge',
  'fabric',
  'quilt',
  'neoforge',
  'cauldron',
  'liteloader',
]);

export function id(value: string) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0)
    throw new Error(tr('curseforge.invalidCurseforgeProjectOrFileId'));
  return Number(value);
}
export function fileHashes(file: CurseForgeFile): Record<string, string> {
  const sha1 = file.hashes.find((hash) => hash.algo === 1)?.value;
  const md5 = file.hashes.find((hash) => hash.algo === 2)?.value;
  if (!sha1 && !md5)
    throw new Error(tr('curseforge.curseforgeFileHasNoChecksumValue', { value1: file.fileName }));
  return sha1 ? { sha1 } : { md5: md5 as string };
}
export function assertDownload(project: CurseForgeProject, file: CurseForgeFile) {
  if (project.allowModDistribution === false || !file.downloadUrl)
    throw new Error(
      tr('curseforge.theAuthorHasDisabledThirdPartyDownloads', { value1: project.name }),
    );
  if (!project.isAvailable || !file.isAvailable || file.isServerPack)
    throw new Error(
      tr('curseforge.thisCurseforgeFileCannotBeInstalledOn', { value1: file.displayName }),
    );
  fileHashes(file);
}
export function isCompatible(file: CurseForgeFile, instance: Instance, category: Category) {
  if (!file.gameVersions.includes(instance.version)) return false;
  if (category !== 'mods') return true;
  const declared = file.gameVersions
    .map((version) => version.toLowerCase())
    .filter((version) => loaderNames.has(version));
  return declared.length
    ? declared.includes(instance.loader.toLowerCase())
    : instance.loader !== 'Vanilla';
}
