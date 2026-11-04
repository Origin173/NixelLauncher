import type { Loader } from '../../shared/contracts';
import type { NixelHost } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { inside } from '../files';
import type { CurseForgePackFile, CurseForgeResourceProvider } from '../providers';
import { open, readAllEntries, readEntry } from '../zip';
import type { CurseForgeManifest, MrpackIndex } from './types';
export async function readPack(host: NixelHost, path: string) {
  const zip = await open(path, { lazyEntries: true, autoClose: false });
  try {
    const entries = await readAllEntries(zip);
    const indexEntry = entries.find((entry) => entry.fileName === 'modrinth.index.json');
    const manifestEntry = entries.find((entry) => entry.fileName === 'manifest.json');
    let manifest: unknown;
    let index: MrpackIndex;
    let curseForgeFiles: CurseForgePackFile[] | undefined;
    let curseForgeProvider: CurseForgeResourceProvider | undefined;
    let overridePrefixes = ['overrides/', 'client-overrides/'];
    if (indexEntry) {
      index = JSON.parse((await readEntry(zip, indexEntry)).toString('utf8')) as MrpackIndex;
      manifest = index;
    } else if (manifestEntry) {
      const parsedManifest = JSON.parse(
        (await readEntry(zip, manifestEntry)).toString('utf8'),
      ) as CurseForgeManifest;
      manifest = parsedManifest;
      if (
        parsedManifest.manifestType !== 'minecraftModpack' ||
        parsedManifest.manifestVersion !== 1 ||
        !parsedManifest.minecraft?.version ||
        !Array.isArray(parsedManifest.files) ||
        !Array.isArray(parsedManifest.minecraft.modLoaders)
      )
        throw new Error(tr('modpacks.invalidCurseforgeManifestJson'));
      const dependencies: Record<string, string> = { minecraft: parsedManifest.minecraft.version };
      const primary =
        parsedManifest.minecraft.modLoaders.find((loader) => loader.primary) ||
        parsedManifest.minecraft.modLoaders[0];
      if (primary) {
        const match = /^(forge|fabric|neoforge)-(.+)$/.exec(primary.id);
        if (!match?.[1] || !match[2])
          throw new Error(tr('modpacks.thisModpackSLoaderIsNotSupported', { value1: primary.id }));
        dependencies[match[1] === 'fabric' ? 'fabric-loader' : match[1]] = match[2];
      }
      curseForgeFiles = parsedManifest.files.filter((file) => file.required !== false);
      const pinned = new Map<number, number>();
      for (const file of curseForgeFiles) {
        if (
          !Number.isSafeInteger(file.projectID) ||
          file.projectID <= 0 ||
          !Number.isSafeInteger(file.fileID) ||
          file.fileID <= 0
        )
          throw new Error(tr('modpacks.theCurseforgeModpackContainsAnInvalidProject'));
        if (pinned.has(file.projectID) && pinned.get(file.projectID) !== file.fileID)
          throw new Error(tr('modpacks.theCurseforgeModpackSpecifiesConflictingVersionsFor'));
        pinned.set(file.projectID, file.fileID);
      }
      const overrides = (parsedManifest.overrides || 'overrides').replace(/\/$/, '');
      inside(host.store.cacheRoot, overrides);
      overridePrefixes = [`${overrides}/`];
      index = {
        formatVersion: 1,
        game: 'minecraft',
        versionId: parsedManifest.version,
        name: parsedManifest.name,
        dependencies,
        files: [],
      };
      curseForgeProvider = host.providers.get<CurseForgeResourceProvider>(
        'resources',
        'nixel.resources.curseforge',
      );
    } else throw new Error(tr('modpacks.theModpackIsMissingModrinthIndexJson'));
    if (
      index.formatVersion !== 1 ||
      index.game !== 'minecraft' ||
      !index.dependencies?.minecraft ||
      !Array.isArray(index.files)
    )
      throw new Error(tr('modpacks.unsupportedModpackFormat'));
    const supported = ['minecraft', 'fabric-loader', 'forge', 'neoforge', 'quilt-loader'];
    const unsupported = Object.keys(index.dependencies).find((key) => !supported.includes(key));
    if (unsupported)
      throw new Error(
        tr('modpacks.thisModpackContainsAnUnsupportedComponentValue', { value1: unsupported }),
      );
    let loader: Loader = 'Vanilla';
    let loaderVersion: string | undefined;
    for (const [key, kind] of [
      ['fabric-loader', 'Fabric'],
      ['forge', 'Forge'],
      ['neoforge', 'NeoForge'],
      ['quilt-loader', 'Quilt'],
    ] as const)
      if (index.dependencies[key]) {
        loader = kind;
        loaderVersion = index.dependencies[key];
      }
    // Validate every path before creating the instance or materializing archive entries.
    for (const entry of entries) {
      if (entry.fileName.endsWith('/')) continue;
      inside(host.store.cacheRoot, entry.fileName);
      if (((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000)
        throw new Error(tr('modpacks.modpacksCannotContainSymbolicLinks'));
    }
    for (const file of index.files) {
      inside(host.store.cacheRoot, file.path);
      if (!file.hashes?.sha1 || !file.hashes?.sha512 || !file.downloads?.length)
        throw new Error(tr('modpacks.aModpackFileIsMissingSha1'));
      if (file.downloads.some((url) => new URL(url).protocol !== 'https:'))
        throw new Error(tr('modpacks.modpackDownloadUrlsMustUseHttps'));
    }

    return {
      manifest,
      zip,
      entries,
      index,
      curseForgeFiles,
      curseForgeProvider,
      overridePrefixes,
      target: { version: index.dependencies.minecraft, loader, loaderVersion },
    };
  } catch (error) {
    zip.close();
    throw error;
  }
}
export type ParsedPack = Awaited<ReturnType<typeof readPack>>;
