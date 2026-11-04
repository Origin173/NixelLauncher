import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tr } from '../shared/i18n';
import { inside, json } from './files';
import { installForge } from './forge-installer';
import { installFiles } from './install-files';
import { libraryArtifacts, type MinecraftVersion, readVersion } from './minecraft-version';

export type LoaderKind = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge';
export interface InstallInput {
  directory: string;
  minecraft: string;
  loader: LoaderKind;
  loaderVersion?: string;
  java: string;
  concurrency?: number;
}
export interface WorkProgress {
  signal: AbortSignal;
  update: (message: string, current?: number, total?: number) => void;
}
interface VersionManifest {
  versions: { id: string; type: string; releaseTime: string; url: string; sha1: string }[];
}
const versionManifest = (signal?: AbortSignal) =>
  json<VersionManifest>('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', {
    signal,
  });
const loaderMeta = (loader: 'fabric' | 'quilt') =>
  loader === 'fabric' ? 'https://meta.fabricmc.net/v2' : 'https://meta.quiltmc.org/v3';

export async function listMinecraftVersions() {
  return (await versionManifest()).versions.map(({ id, type, releaseTime }) => ({
    id,
    type,
    releaseTime,
  }));
}
export async function listLoaderVersions(
  loader: LoaderKind,
  minecraft: string,
  signal?: AbortSignal,
) {
  if (loader === 'vanilla') return [];
  if (loader === 'fabric' || loader === 'quilt') {
    const entries = await json<{ loader: { version: string } }[]>(
      `${loaderMeta(loader)}/versions/loader/${encodeURIComponent(minecraft)}`,
      { signal },
    );
    return entries
      .map((entry) => entry.loader.version)
      .sort(
        (a, b) =>
          Number(a.includes('-')) - Number(b.includes('-')) ||
          b.localeCompare(a, 'en', { numeric: true }),
      );
  }
  if (loader === 'forge') {
    const response = await fetch(
      'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml',
      { signal },
    );
    if (!response.ok)
      throw new Error(
        tr('files.requestFailedValueValue', {
          value1: response.status,
          value2: 'maven.minecraftforge.net',
        }),
      );
    return [...(await response.text()).matchAll(/<version>([^<]+)<\/version>/g)]
      .map((entry) => entry[1] ?? '')
      .filter((version) => version.startsWith(`${minecraft}-`))
      .map((version) => version.slice(minecraft.length + 1))
      .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  }
  const project = minecraft === '1.20.1' ? 'forge' : 'neoforge';
  const response = await fetch(
    `https://maven.neoforged.net/releases/net/neoforged/${project}/maven-metadata.xml`,
    { signal },
  );
  if (!response.ok)
    throw new Error(
      tr('minecraft-engine.neoforgeVersionLookupFailedHttpValue', { value1: response.status }),
    );
  const content = await response.text();
  const [, minor, patch = '0'] = minecraft.split('.');
  const prefix =
    project === 'forge'
      ? `${minecraft}-`
      : Number(minecraft.split('.')[0]) >= 26
        ? `${minecraft}.`
        : `${minor}.${patch}.`;
  return [...content.matchAll(/<version>([^<]+)<\/version>/g)]
    .map((entry) => entry[1] ?? '')
    .filter((version) => version.startsWith(prefix))
    .sort(
      (a, b) =>
        Number(a.includes('-')) - Number(b.includes('-')) ||
        b.localeCompare(a, 'en', { numeric: true }),
    );
}
export async function requiredJava(minecraft: string, signal?: AbortSignal) {
  const metadata = (await versionManifest(signal)).versions.find((entry) => entry.id === minecraft);
  if (!metadata)
    throw new Error(tr('minecraft-engine.minecraftVersionNotFoundValue', { value1: minecraft }));
  return (await json<MinecraftVersion>(metadata.url, { signal })).javaVersion?.majorVersion ?? 8;
}

export async function writeVersion(root: string, version: MinecraftVersion) {
  const target = inside(root, `versions/${version.id}/${version.id}.json`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(version, null, 2));
}

export async function installMinecraft(input: InstallInput, progress: WorkProgress) {
  const root = input.directory;
  const execute = (files: Parameters<typeof installFiles>[0], key: Parameters<typeof tr>[0]) =>
    installFiles(files, progress, tr(key), input.concurrency);
  const metadata = (await versionManifest(progress.signal)).versions.find(
    (entry) => entry.id === input.minecraft,
  );
  if (!metadata)
    throw new Error(
      tr('minecraft-engine.minecraftVersionNotFoundValue', { value1: input.minecraft }),
    );
  await execute(
    [{ ...metadata, target: inside(root, `versions/${input.minecraft}/${input.minecraft}.json`) }],
    'minecraft-engine.downloadingGameVersionMetadata',
  );
  let version = await readVersion(root, input.minecraft);
  const client = version.downloads?.client;
  if (!client) throw new Error(tr('engine.clientMissing', { id: input.minecraft }));
  await execute(
    [{ ...client, target: inside(root, `versions/${input.minecraft}/${input.minecraft}.jar`) }],
    'minecraft-engine.downloadingTheGame',
  );
  await execute(
    libraryArtifacts(version.libraries, root),
    'minecraft-engine.downloadingBaseGameLibraries',
  );
  let versionId = input.minecraft;
  if (input.loader !== 'vanilla') {
    const loaderVersion =
      input.loaderVersion ??
      (await listLoaderVersions(input.loader, input.minecraft, progress.signal))[0];
    if (!loaderVersion) throw new Error(tr('game.noCompatibleLoaderVersionFound'));
    progress.update(
      tr('minecraft-engine.installValueValue', { value1: input.loader, value2: loaderVersion }),
    );
    if (input.loader === 'fabric' || input.loader === 'quilt') {
      const profile = await json<MinecraftVersion>(
        `${loaderMeta(input.loader)}/versions/loader/${encodeURIComponent(input.minecraft)}/${encodeURIComponent(loaderVersion)}/profile/json`,
        { signal: progress.signal },
      );
      await writeVersion(root, profile);
      versionId = profile.id;
    } else versionId = await installForge({ ...input, loaderVersion }, progress);
    version = await readVersion(root, versionId);
  }
  await execute(
    libraryArtifacts(version.libraries, root),
    'minecraft-engine.downloadingGameLibraries',
  );
  if (version.logging?.client) {
    const file = version.logging.client.file;
    await execute(
      [{ ...file, target: inside(join(root, 'assets/log_configs'), file.id) }],
      'engine.installLogging',
    );
  }
  if (version.assetIndex) {
    const indexFile = inside(root, `assets/indexes/${version.assetIndex.id}.json`);
    await execute(
      [{ ...version.assetIndex, target: indexFile }],
      'minecraft-engine.downloadingTheAssetIndex',
    );
    const assets = JSON.parse(await readFile(indexFile, 'utf8')) as {
      objects: Record<string, { hash: string; size: number }>;
      virtual?: boolean;
      map_to_resources?: boolean;
    };
    const files = Object.values(assets.objects).map(({ hash, size }) => ({
      url: `https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`,
      sha1: hash,
      size,
      target: inside(root, `assets/objects/${hash.slice(0, 2)}/${hash}`),
    }));
    await execute(files, 'minecraft-engine.downloadingGameAssets');
    if (assets.virtual || assets.map_to_resources)
      for (const [name, { hash }] of Object.entries(assets.objects)) {
        progress.signal.throwIfAborted();
        for (const directory of [
          assets.virtual ? `assets/virtual/${version.assetIndex.id}` : '',
          assets.map_to_resources ? 'resources' : '',
        ].filter(Boolean)) {
          const target = inside(join(root, directory), name);
          await mkdir(dirname(target), { recursive: true });
          await copyFile(inside(root, `assets/objects/${hash.slice(0, 2)}/${hash}`), target);
        }
      }
  }
  return versionId;
}
