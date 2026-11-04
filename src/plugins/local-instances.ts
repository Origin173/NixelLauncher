import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Context } from 'cordis';
import type { Instance, Loader } from '../shared/contracts';
import type { NixelHost, TaskContext } from '../shared/host-api';
import { tr } from '../shared/i18n';
import { commandsFor } from './commands';
import { inside } from './files';
import { assertInstanceIdle, createInstance, getInstance } from './instance-state';

interface LocalVersion {
  id: string;
  inheritsFrom?: string;
  mainClass?: string;
  libraries?: { name: string }[];
}

async function detectVersions(root: string) {
  const versions = await readdir(join(root, 'versions'), { withFileTypes: true });
  const candidates: LocalVersion[] = [];
  for (const entry of versions) {
    if (!entry.isDirectory()) continue;
    const path = inside(root, `versions/${entry.name}/${entry.name}.json`);
    const info = await lstat(path).catch(() => undefined);
    if (!info?.isFile()) continue;
    try {
      const version = JSON.parse(await readFile(path, 'utf8')) as LocalVersion;
      if (version.id === entry.name) candidates.push(version);
    } catch {
      /* An unrelated incomplete profile does not hide valid versions. */
    }
  }
  if (!candidates.length)
    throw new Error(tr('local-instances.noRecognizableMinecraftVersionFilesFoundIn'));
  return candidates.map((profile) => describeVersion(profile, candidates));
}

function describeVersion(profile: LocalVersion, candidates: LocalVersion[]) {
  let loader: Loader = 'Vanilla';
  let loaderVersion: string | undefined;
  for (const library of profile.libraries || []) {
    const [group, artifact, version] = library.name.split(':');
    if (artifact === 'fabric-loader') loader = 'Fabric';
    else if (group === 'net.neoforged' && artifact === 'neoforge') loader = 'NeoForge';
    else if (group === 'net.minecraftforge' && artifact === 'forge') loader = 'Forge';
    else if (artifact === 'quilt-loader') loader = 'Quilt';
    else continue;
    loaderVersion = loader === 'Forge' ? version?.replace(/^\d[^-]*-/, '') : version;
    break;
  }
  let parent = profile;
  const seen = new Set<string>();
  while (parent.inheritsFrom && !seen.has(parent.id)) {
    seen.add(parent.id);
    const inherited = candidates.find((candidate) => candidate.id === parent.inheritsFrom);
    if (!inherited) break;
    parent = inherited;
  }
  return {
    versionId: profile.id,
    version: parent.inheritsFrom || parent.id,
    loader,
    loaderVersion,
    launchVersion: profile.id,
  };
}

async function copyTree(source: string, target: string, task: TaskContext) {
  const sourceRoot = await realpath(source);
  const targetRoot = resolve(target);
  const difference = relative(sourceRoot, targetRoot);
  if (
    !difference ||
    (!isAbsolute(difference) && difference !== '..' && !difference.startsWith(`..${sep}`))
  )
    throw new Error(tr('local-instances.theTargetInstanceDirectoryCannotBeInside'));
  const files: { source: string; name: string; size: number }[] = [];
  async function walk(root: string, prefix = '') {
    task.signal.throwIfAborted();
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink())
        throw new Error(
          tr('local-instances.copyingSymbolicLinksIsNotSupportedValue', { value1: name }),
        );
      if (
        !prefix &&
        [
          'launcher_accounts.json',
          'launcher_profiles.json',
          'launcher_profiles_microsoft_store.json',
        ].includes(entry.name)
      )
        continue;
      const path = inside(sourceRoot, name);
      if (entry.isDirectory()) {
        await mkdir(inside(targetRoot, name), { recursive: true });
        await walk(path, name);
      } else if (entry.isFile()) files.push({ source: path, name, size: (await lstat(path)).size });
    }
  }
  await walk(sourceRoot);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  let completed = 0;
  for (const file of files) {
    task.signal.throwIfAborted();
    const path = inside(targetRoot, file.name);
    await mkdir(dirname(path), { recursive: true });
    const source = createReadStream(file.source);
    source.on('data', (chunk) => {
      completed += chunk.length;
      task.report(
        total ? (completed / total) * 100 : 0,
        tr('local-instances.copyValue', { value1: file.name }),
      );
    });
    await pipeline(source, createWriteStream(path), { signal: task.signal });
  }
  task.log(
    tr('local-instances.copiedValueFilesIncludingSavesAndConfiguration', { value1: files.length }),
  );
}

async function copyInstance(
  host: NixelHost,
  task: TaskContext,
  source: string,
  input: {
    name: string;
    version: string;
    loader: Loader;
    loaderVersion?: string;
    launchVersion?: string;
  },
  original?: Instance,
) {
  const root = resolve(host.store.read().settings.instanceDirectory || host.store.instancesRoot);
  const instance = await createInstance(
    host,
    { ...input, install: false },
    { taskId: task.taskId, root },
  );
  if (!original) task.setInstance(instance.id);
  try {
    await host.store.update((draft) => {
      const item = draft.instances.find((entry) => entry.id === instance.id);
      if (item) item.status = 'installing';
    });
    await copyTree(source, instance.directory, task);
    task.signal.throwIfAborted();
    await host.store.update((draft) => {
      const item = draft.instances.find((entry) => entry.id === instance.id);
      if (!item) return;
      if (original) {
        item.account = original.account;
        item.memory = original.memory;
        item.javaPath = original.javaPath;
        item.jvmArgs = original.jvmArgs ? [...original.jvmArgs] : undefined;
        item.gameArgs = original.gameArgs ? [...original.gameArgs] : undefined;
        item.resolution = original.resolution ? { ...original.resolution } : undefined;
        item.fullscreen = original.fullscreen;
        item.providers = structuredClone(original.providers);
        item.providerConfig = structuredClone(original.providerConfig);
        item.servers = structuredClone(original.servers);
        item.modpack = structuredClone(original.modpack);
        draft.content.push(
          ...draft.content
            .filter((entry) => entry.instance === original.id)
            .map((entry) => ({ ...entry, id: randomUUID(), instance: instance.id })),
        );
      }
      item.launchVersion = input.launchVersion;
      item.status = original ? original.status : 'ready';
      item.error = original?.error;
      item.pendingOperation = undefined;
    });
    task.log(tr('local-instances.newInstanceValue', { value1: instance.name }));
  } catch (error) {
    const target = inside(root, instance.id);
    if (target !== resolve(instance.directory))
      throw new Error(tr('local-instances.theNewInstanceDirectoryBoundaryDoesNot'), {
        cause: error,
      });
    await rm(target, { recursive: true, force: true });
    await host.store.update((draft) => {
      draft.instances = draft.instances.filter((entry) => entry.id !== instance.id);
      draft.content = draft.content.filter((entry) => entry.instance !== instance.id);
    });
    throw error;
  }
}

export function registerLocalInstances(ctx: Context) {
  const host = ctx.nixel;
  const command = commandsFor(ctx);
  command('instances.detectDirectory', async ({ path }: { path: string }) =>
    detectVersions(await realpath(path)),
  );
  command(
    'instances.importDirectory',
    ({ path, name, versionId }: { path: string; name?: string; versionId?: string }) => ({
      taskId: host.tasks.start(
        tr('local-instances.importGameDirectory'),
        tr('local-instances.detectingLocalGameVersions'),
        async (task) => {
          const source = await realpath(path);
          const versions = await detectVersions(source);
          const version = versionId
            ? versions.find((version) => version.versionId === versionId)
            : versions.length === 1
              ? versions[0]
              : undefined;
          if (!version) throw new Error(tr('local-instances.chooseAGameVersionToImportFrom'));
          await copyInstance(host, task, source, {
            ...version,
            name:
              name?.trim() || source.split(/[\\/]/).pop() || tr('local-instances.importedInstance'),
          });
        },
        {
          kind: 'import',
          retry: { command: 'instances.importDirectory', params: { path, name, versionId } },
        },
      ),
    }),
  );
  command('instances.clone', ({ id, name }: { id: string; name?: string }) => {
    const original = getInstance(host, id);
    assertInstanceIdle(host, id);
    return {
      taskId: host.tasks.start(
        tr('local-instances.copyValue', { value1: original.name }),
        tr('local-instances.preparingToCopyTheInstance'),
        async (task) => {
          const original = getInstance(host, id);
          assertInstanceIdle(host, id, task.taskId);
          await copyInstance(
            host,
            task,
            original.directory,
            {
              ...original,
              name: name?.trim() || tr('local-instances.valueCopy', { value1: original.name }),
            },
            original,
          );
        },
        {
          instanceId: id,
          kind: 'clone',
          retry: { command: 'instances.clone', params: { id, name } },
        },
      ),
    };
  });
}
