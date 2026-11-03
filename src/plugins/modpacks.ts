import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { open, openEntryReadStream, readAllEntries, readEntry } from '@xmcl/unzip';
import type { Context } from 'cordis';
import { ZipFile } from 'yazl';
import type { Loader } from '../shared/contracts';
import type { NixelHost, TaskContext } from '../shared/host-api';
import { tr } from '../shared/i18n';
import type { CurseForgePackFile, CurseForgeResourceProvider } from './curseforge';
import { download, inside } from './files';
import { assertInstanceIdle, createInstance, getInstance } from './game';
import type { GameProvider } from './providers';

interface MrpackIndex {
  formatVersion: 1;
  game: 'minecraft';
  versionId: string;
  name: string;
  summary?: string;
  dependencies: Record<string, string>;
  files: {
    path: string;
    hashes: Record<string, string>;
    downloads: string[];
    fileSize: number;
    env?: { client?: string; server?: string };
  }[];
}

interface CurseForgeManifest {
  manifestType: 'minecraftModpack';
  manifestVersion: 1;
  name: string;
  version: string;
  minecraft: { version: string; modLoaders: { id: string; primary?: boolean }[] };
  files: CurseForgePackFile[];
  overrides?: string;
}

export async function importModpack(
  host: NixelHost,
  path: string,
  task: TaskContext,
  name?: string,
) {
  const zip = await open(path, { lazyEntries: true, autoClose: false });
  let createdInstance: { id: string; directory: string; root: string } | undefined;
  try {
    const entries = await readAllEntries(zip);
    const indexEntry = entries.find((entry) => entry.fileName === 'modrinth.index.json');
    const manifestEntry = entries.find((entry) => entry.fileName === 'manifest.json');
    let index: MrpackIndex;
    let curseForgeFiles: CurseForgePackFile[] | undefined;
    let curseForgeProvider: CurseForgeResourceProvider | undefined;
    let overridePrefixes = ['overrides/', 'client-overrides/'];
    if (indexEntry)
      index = JSON.parse((await readEntry(zip, indexEntry)).toString('utf8')) as MrpackIndex;
    else if (manifestEntry) {
      const manifest = JSON.parse(
        (await readEntry(zip, manifestEntry)).toString('utf8'),
      ) as CurseForgeManifest;
      if (
        manifest.manifestType !== 'minecraftModpack' ||
        manifest.manifestVersion !== 1 ||
        !manifest.minecraft?.version ||
        !Array.isArray(manifest.files) ||
        !Array.isArray(manifest.minecraft.modLoaders)
      )
        throw new Error(tr('modpacks.invalidCurseforgeManifestJson'));
      const dependencies: Record<string, string> = { minecraft: manifest.minecraft.version };
      const primary =
        manifest.minecraft.modLoaders.find((loader) => loader.primary) ||
        manifest.minecraft.modLoaders[0];
      if (primary) {
        const match = /^(forge|fabric|neoforge)-(.+)$/.exec(primary.id);
        if (!match?.[1] || !match[2])
          throw new Error(tr('modpacks.thisModpackSLoaderIsNotSupported', { value1: primary.id }));
        dependencies[match[1] === 'fabric' ? 'fabric-loader' : match[1]] = match[2];
      }
      curseForgeFiles = manifest.files.filter((file) => file.required !== false);
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
      const overrides = (manifest.overrides || 'overrides').replace(/\/$/, '');
      inside(host.store.cacheRoot, overrides);
      overridePrefixes = [`${overrides}/`];
      index = {
        formatVersion: 1,
        game: 'minecraft',
        versionId: manifest.version,
        name: manifest.name,
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
    if (curseForgeProvider && curseForgeFiles)
      await curseForgeProvider.prepareFiles(curseForgeFiles, task.signal);
    task.signal.throwIfAborted();
    const instancesRoot = resolve(
      host.store.read().settings.instanceDirectory || host.store.instancesRoot,
    );
    const instance = await createInstance(
      host,
      {
        name: name || index.name,
        version: index.dependencies.minecraft,
        loader,
        loaderVersion,
        install: false,
      },
      { taskId: task.taskId, root: instancesRoot },
    );
    createdInstance = { id: instance.id, directory: instance.directory, root: instancesRoot };
    task.setInstance(instance.id);
    task.signal.throwIfAborted();
    await host.store.update((draft) => {
      const item = draft.instances.find((entry) => entry.id === instance.id);
      if (item) {
        item.status = 'installing';
        item.providers.resources = curseForgeProvider
          ? 'nixel.resources.curseforge'
          : 'nixel.resources.modrinth';
      }
    });
    const provider = host.providers.get<GameProvider>('game', instance.providers.game);
    const launchVersion = await provider.install(instance, task);
    if (curseForgeProvider && curseForgeFiles)
      await curseForgeProvider.installFiles(curseForgeFiles, instance, task);
    let completed = 0;
    const clientFiles = index.files.filter((file) => file.env?.client !== 'unsupported');
    for (const file of clientFiles) {
      task.signal.throwIfAborted();
      const target = inside(instance.directory, file.path);
      let failure: unknown;
      for (const url of file.downloads) {
        try {
          await download(url, target, task.signal, file.hashes);
          failure = undefined;
          break;
        } catch (error) {
          failure = error;
          if (task.signal.aborted) throw error;
        }
      }
      if (failure) throw failure;
      task.report(
        (++completed / clientFiles.length) * 100,
        tr('modpacks.importModpackFileValueValue', {
          value1: completed,
          value2: clientFiles.length,
        }),
      );
    }
    for (const prefix of overridePrefixes) {
      for (const entry of entries.filter(
        (item) => item.fileName.startsWith(prefix) && !item.fileName.endsWith('/'),
      )) {
        task.signal.throwIfAborted();
        const target = inside(instance.directory, entry.fileName.slice(prefix.length));
        await mkdir(dirname(target), { recursive: true });
        await pipeline(await openEntryReadStream(zip, entry), createWriteStream(target), {
          signal: task.signal,
        });
      }
    }
    task.signal.throwIfAborted();
    await host.store.update((draft) => {
      const item = draft.instances.find((entry) => entry.id === instance.id);
      if (item) {
        item.status = 'ready';
        item.launchVersion = launchVersion;
        item.pendingOperation = undefined;
      }
    });
    task.signal.throwIfAborted();
    task.log(tr('modpacks.modpackImportedValue', { value1: instance.name }));
    return instance.id;
  } catch (error) {
    if (createdInstance) {
      const created = createdInstance;
      const failures: unknown[] = [error];
      try {
        const directory = inside(created.root, created.id);
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(created.id) ||
          directory !== resolve(created.directory)
        )
          throw new Error(tr('modpacks.theNewInstanceDirectoryBoundaryDoesNot'));
        await rm(directory, { recursive: true, force: true });
        await host.store.update((draft) => {
          draft.instances = draft.instances.filter((entry) => entry.id !== created.id);
          draft.content = draft.content.filter((entry) => entry.instance !== created.id);
        });
        task.log(tr('modpacks.removedTheUnfinishedModpackInstanceRetryingWill'));
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
      if (failures.length > 1)
        throw new AggregateError(
          failures,
          tr('modpacks.modpackImportFailedAndCleanupWasIncomplete'),
        );
    }
    throw error;
  } finally {
    zip.close();
  }
}

async function exportModpack(host: NixelHost, id: string, path: string, task: TaskContext) {
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

export function registerModpacks(ctx: Context) {
  const host = ctx.nixel;
  host.commands.register(
    ctx,
    'instances.import',
    ({ path, name }: { path: string; name?: string }) => ({
      taskId: host.tasks.start(
        tr('modpacks.importModpack'),
        tr('modpacks.readingTheModpackManifest'),
        async (task) => {
          await importModpack(host, path, task, name);
        },
        { kind: 'import', retry: { command: 'instances.import', params: { path, name } } },
      ),
    }),
  );
  host.commands.register(ctx, 'instances.export', ({ id, path }: { id: string; path: string }) => {
    assertInstanceIdle(host, id);
    return {
      taskId: host.tasks.start(
        tr('modpacks.exportModpack'),
        tr('modpacks.packingTheInstanceAndSaves'),
        (task) => exportModpack(host, id, path, task),
        {
          instanceId: id,
          kind: 'export',
          retry: { command: 'instances.export', params: { id, path } },
        },
      ),
    };
  });
}
