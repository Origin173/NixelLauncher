import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Instance } from '../../shared/contracts';
import type { TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import type { ModpackState, PackProvenance } from '../../shared/modpack-contracts';
import { download, hashFile, inside } from '../files';
import { type ContentDownload, contentDirectories } from '../resource-files';
import { openEntryReadStream } from '../zip';
import type { ParsedPack } from './archive';

export interface MaterializedPack {
  paths: string[];
  content: ContentDownload[];
}
export async function materializePack(
  pack: ParsedPack,
  instance: Instance,
  task: TaskContext,
): Promise<MaterializedPack> {
  const paths = new Set<string>();
  const content =
    pack.curseForgeProvider && pack.curseForgeFiles
      ? await pack.curseForgeProvider.resolvePackFiles(pack.curseForgeFiles, instance, task.signal)
      : [];
  const files = [
    ...pack.index.files
      .filter((file) => file.env?.client !== 'unsupported')
      .map((file) => ({ path: file.path, hashes: file.hashes, downloads: file.downloads })),
    ...content.map((file) => ({
      path: `${contentDirectories[file.category]}/${file.fileName}`,
      hashes: file.hashes,
      downloads: [file.url],
    })),
  ];
  const reserve = (path: string) => {
    if (
      path.toLowerCase().startsWith('.nixel/') ||
      [
        'launcher_accounts.json',
        'launcher_profiles.json',
        'launcher_profiles_microsoft_store.json',
      ].includes(path.toLowerCase())
    )
      throw new Error(tr('packUpgrade.unsafePath', { path }));
    return inside(instance.directory, path);
  };
  for (const file of files) {
    if (paths.has(file.path.toLowerCase()))
      throw new Error(tr('packUpgrade.duplicatePath', { path: file.path }));
    paths.add(file.path.toLowerCase());
    reserve(file.path);
  }
  paths.clear();
  let completed = 0;
  for (const file of files) {
    task.signal.throwIfAborted();
    let failure: unknown;
    for (const url of file.downloads) {
      try {
        await download(url, reserve(file.path), task.signal, file.hashes);
        failure = undefined;
        break;
      } catch (error) {
        failure = error;
        task.signal.throwIfAborted();
      }
    }
    if (failure) throw failure;
    paths.add(file.path);
    task.report((++completed / Math.max(files.length, 1)) * 100, file.path);
  }
  for (const prefix of pack.overridePrefixes) {
    const names = new Set<string>();
    for (const entry of pack.entries.filter(
      (entry) => entry.fileName.startsWith(prefix) && !entry.fileName.endsWith('/'),
    )) {
      task.signal.throwIfAborted();
      const path = entry.fileName.slice(prefix.length);
      if (names.has(path.toLowerCase())) throw new Error(tr('packUpgrade.duplicatePath', { path }));
      names.add(path.toLowerCase());
      if (
        [...paths].some(
          (previous) => previous.toLowerCase() === path.toLowerCase() && previous !== path,
        )
      )
        throw new Error(tr('packUpgrade.duplicatePath', { path }));
      const target = reserve(path);
      await mkdir(dirname(target), { recursive: true });
      await pipeline(await openEntryReadStream(pack.zip, entry), createWriteStream(target), {
        signal: task.signal,
      });
      paths.add(path);
    }
  }
  const overridden = new Set(
    pack.entries.flatMap((entry) =>
      pack.overridePrefixes
        .filter((prefix) => entry.fileName.startsWith(prefix))
        .map((prefix) => entry.fileName.slice(prefix.length)),
    ),
  );
  return {
    paths: [...paths].sort(),
    content: content.filter(
      (file) => !overridden.has(`${contentDirectories[file.category]}/${file.fileName}`),
    ),
  };
}
export async function captureBaseline(
  pack: ParsedPack,
  directory: string,
  materialized: MaterializedPack,
  provenance: PackProvenance | undefined,
  signal: AbortSignal,
): Promise<ModpackState> {
  const files = [];
  for (const path of materialized.paths)
    files.push({ path, sha256: await hashFile(inside(directory, path), 'sha256', signal) });
  return {
    format: pack.curseForgeFiles ? 'curseforge' : 'modrinth',
    name: pack.index.name,
    version: pack.index.versionId,
    manifest: pack.manifest,
    provenance,
    files,
  };
}
