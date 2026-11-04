import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';
import type { NixelHost, TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { assertInstanceIdle, getInstance } from '../instance-state';
import type { MrpackIndex } from './types';
export async function exportModpack(host: NixelHost, id: string, path: string, task: TaskContext) {
  const instance = getInstance(host, id);
  assertInstanceIdle(host, id, task.taskId);
  if (host.running.has(id)) throw new Error(tr('modpacks.stopTheGameBeforeExportingAModpack'));
  const dependencies: Record<string, string> = { minecraft: instance.version };
  const loaderKey = {
    Fabric: 'fabric-loader',
    Forge: 'forge',
    NeoForge: 'neoforge',
    Quilt: 'quilt-loader',
    Vanilla: '',
  }[instance.loader];
  if (loaderKey && instance.loaderVersion) dependencies[loaderKey] = instance.loaderVersion;
  if (loaderKey && !instance.loaderVersion) {
    throw new Error(tr('modpacks.theExactLoaderVersionIsMissingFinish'));
  }
  const index: MrpackIndex = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: '1.0.0',
    name: instance.name,
    dependencies,
    files: [],
  };
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify(index, null, 2)), 'modrinth.index.json');
  const files: { path: string; name: string }[] = [];
  async function walk(root: string, prefix: string) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const path = join(root, entry.name);
      const name = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(path, name);
      else if (entry.isFile()) files.push({ path, name });
    }
  }
  for (const directory of [
    'mods',
    'resourcepacks',
    'shaderpacks',
    'config',
    'defaultconfigs',
    'saves',
    'screenshots',
  ])
    await walk(join(instance.directory, directory), directory);
  for (const name of ['options.txt', 'optionsof.txt', 'servers.dat', 'icon.png']) {
    const path = join(instance.directory, name);
    if (
      await stat(path).then(
        (info) => info.isFile(),
        () => false,
      )
    )
      files.push({ path, name });
  }
  task.signal.throwIfAborted();
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.part`;
  try {
    const output = pipeline(zip.outputStream, createWriteStream(temporary), {
      signal: task.signal,
    });
    zip.on('error', (error: Error) => zip.outputStream.emit('error', error));
    for (const file of files) zip.addFile(file.path, `overrides/${file.name}`);
    zip.end();
    await output;
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  task.log(tr('modpacks.exportedValueFilesIncludingPlayerSaves', { value1: files.length }));
}
