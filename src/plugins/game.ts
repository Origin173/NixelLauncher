import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { launch, Version } from '@xmcl/core';
import type { Context } from 'cordis';
import type {
  Account,
  CreateInstanceInput,
  Instance,
  InstanceFile,
  Loader,
} from '../shared/contracts';
import { errorMessage } from '../shared/error-message';
import type { NixelHost, TaskContext } from '../shared/host-api';
import { tr } from '../shared/i18n';
import { validateLaunchOptions } from '../shared/launch-options';
import { commandsFor } from './commands';
import { discoverJava, inspectJava, installJava } from './java';
import { registerLocalInstances } from './local-instances';
import {
  installMinecraft,
  type LoaderKind,
  listLoaderVersions,
  listMinecraftVersions,
  requiredJava,
} from './minecraft-engine';
import { registerModpacks } from './modpacks';
import { cleanupPendingInstances } from './pending-instances';
import type { AccountProvider, GameProvider } from './providers';

export const gameId = 'nixel.game.minecraft';
const logs = new Map<string, string[]>();
function redactLog(text: string, token?: string) {
  if (token && token.length > 8) text = text.replaceAll(token, '[REDACTED]');
  return text.replace(
    /((?:access[_-]?token|refresh[_-]?token|clientToken)["']?\s*(?:[:=]\s*["']?|\s+))[^\s,"'}]+/gi,
    '$1[REDACTED]',
  );
}
export function getInstance(host: NixelHost, id: string) {
  const instance = host.store.read().instances.find((item) => item.id === id);
  if (!instance) throw new Error(tr('game.instanceNotFound'));
  return instance;
}
export function taskProgress(task: TaskContext) {
  return {
    signal: task.signal,
    update: (message: string, current = 0, total = 0) =>
      task.report(total ? (current / total) * 100 : 0, message),
  };
}
export async function selectJava(
  host: NixelHost,
  instance: Instance,
  major: number,
  task?: TaskContext,
) {
  const path = instance.javaPath || host.store.read().settings.javaPath;
  const runtime = path
    ? await inspectJava(path, task?.signal)
    : (await discoverJava(join(host.store.root, 'java'), task?.signal)).find(
        (java) => java.major === major,
      );
  if (!runtime && !path && task && host.store.read().settings.autoDownloadJava)
    return installJava(
      join(host.store.root, 'java'),
      major,
      taskProgress(task),
      host.store.read().settings.downloadConcurrency,
    );
  if (!runtime) throw new Error(tr('game.thisVersionRequiresJavaValueChooseA', { value1: major }));
  if (runtime.major !== major)
    throw new Error(
      tr('game.thisVersionRequiresJavaValueJavaValue', { value1: major, value2: runtime.major }),
    );
  return runtime;
}

export function assertInstanceIdle(host: NixelHost, id: string, currentTaskId?: string) {
  if (
    host.running.has(id) ||
    getInstance(host, id).status === 'installing' ||
    host.tasks
      .list()
      .some(
        (task) => task.id !== currentTaskId && task.instanceId === id && task.status === 'running',
      )
  )
    throw new Error(tr('game.thisInstanceHasAnActiveTaskWait'));
}

export async function createInstance(
  host: NixelHost,
  input: CreateInstanceInput,
  pendingOperation?: Instance['pendingOperation'],
) {
  if (!input.name.trim() || !input.version)
    throw new Error(tr('game.enterAnInstanceNameAndChooseA'));
  const id = randomUUID();
  const settings = host.store.read().settings;
  const directory = join(settings.instanceDirectory || host.store.instancesRoot, id);
  await mkdir(directory, { recursive: true });
  await Promise.all(
    ['mods', 'resourcepacks', 'shaderpacks'].map((name) =>
      mkdir(join(directory, name), { recursive: true }),
    ),
  );
  const instance: Instance = {
    id,
    name: input.name.trim(),
    version: input.version,
    loader: input.loader,
    loaderVersion: input.loaderVersion,
    directory,
    status: pendingOperation ? 'installing' : 'not-installed',
    pendingOperation,
    account: '',
    memory: null,
    javaPath: '',
    providers: { ...settings.providers, accounts: '' },
    providerConfig: {},
    createdAt: new Date().toISOString(),
    playTime: 0,
    color: 'green',
    kind: input.loader,
    hours: tr('game.neverPlayed'),
  };
  await host.store.update((draft) => {
    draft.instances.push(instance);
  });
  return instance;
}

export function startInstall(host: NixelHost, id: string) {
  const instance = getInstance(host, id);
  assertInstanceIdle(host, id);
  return host.tasks.start(
    tr('game.installValue', { value1: instance.name }),
    tr('game.preparingInstallation'),
    async (task) => {
      const instance = getInstance(host, id);
      assertInstanceIdle(host, id, task.taskId);
      const provider = host.providers.get<GameProvider>('game', instance.providers.game);
      await host.store.update((draft) => {
        const item = draft.instances.find((entry) => entry.id === id);
        if (item) {
          item.status = 'installing';
          item.error = undefined;
        }
      });
      try {
        const version = await provider.install(instance, task);
        await host.store.update((draft) => {
          const item = draft.instances.find((entry) => entry.id === id);
          if (item) {
            item.status = 'ready';
            item.launchVersion = version;
          }
        });
      } catch (error) {
        await host.store.update((draft) => {
          const item = draft.instances.find((entry) => entry.id === id);
          if (item) {
            item.status = task.signal.aborted ? 'not-installed' : 'error';
            item.error = task.signal.aborted
              ? tr('game.installationCancelledYouCanRetryIt')
              : errorMessage(error);
          }
        });
        throw error;
      }
    },
    { instanceId: id, kind: 'install', retry: { command: 'instances.install', params: { id } } },
  );
}

export const gamePlugin = {
  name: gameId,
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    const processes = new Map<string, ChildProcess>();
    const stopped = new Set<string>();
    const loaderKind = (loader: Loader): LoaderKind => {
      return loader.toLowerCase() as LoaderKind;
    };
    const provider: GameProvider = {
      versions: listMinecraftVersions,
      async loaders(version, loader) {
        return (await listLoaderVersions(loaderKind(loader), version)).map((id) => ({
          id,
          type: loader,
        }));
      },
      async install(instance, task) {
        const kind = loaderKind(instance.loader);
        const major = await requiredJava(instance.version, task.signal);
        const loaderVersion =
          kind === 'vanilla'
            ? undefined
            : instance.loaderVersion ||
              (await listLoaderVersions(kind, instance.version, task.signal))[0];
        if (kind !== 'vanilla' && !loaderVersion)
          throw new Error(tr('game.noCompatibleLoaderVersionFound'));
        if (loaderVersion && !instance.loaderVersion)
          await host.store.update((draft) => {
            const item = draft.instances.find((entry) => entry.id === instance.id);
            if (item) item.loaderVersion = loaderVersion;
          });
        const java =
          kind === 'forge' || kind === 'neoforge'
            ? await selectJava(host, instance, major, task)
            : undefined;
        return installMinecraft(
          {
            directory: instance.directory,
            minecraft: instance.version,
            loader: kind,
            loaderVersion,
            java: java?.path || 'java',
            concurrency: host.store.read().settings.downloadConcurrency,
          },
          taskProgress(task),
        );
      },
      async launch(instance, account, task) {
        if (host.running.has(instance.id)) throw new Error(tr('game.thisInstanceIsAlreadyRunning'));
        const version = await Version.parse(
          instance.directory,
          instance.launchVersion || instance.version,
        );
        const java = await selectJava(
          host,
          instance,
          version.javaVersion?.majorVersion ||
            (await Version.parse(instance.directory, instance.version).catch(() => undefined))
              ?.javaVersion?.majorVersion ||
            8,
          task,
        );
        const accountProvider = host.providers.get<AccountProvider>(
          'accounts',
          instance.providers.accounts || account.provider,
        );
        if (instance.providers.accounts && account.provider !== instance.providers.accounts)
          throw new Error(tr('game.theAccountDoesNotMatchTheInstance'));
        const session = await accountProvider.session(account, task.signal);
        task.signal.throwIfAborted();
        task.report(0, tr('game.startingTheGame'));
        const logPath = join(instance.directory, 'nixel-launch.log');
        await writeFile(logPath, '', 'utf8');
        const memory = instance.memory ?? host.store.read().settings.memory;
        const process = await launch({
          ...session,
          version,
          gamePath: instance.directory,
          resourcePath: instance.directory,
          javaPath: java.path,
          maxMemory: memory,
          minMemory: Math.min(512, memory),
          extraJVMArgs: instance.jvmArgs ?? host.store.read().settings.jvmArgs,
          extraMCArgs: instance.gameArgs ?? host.store.read().settings.gameArgs,
          resolution: {
            ...(instance.resolution ?? host.store.read().settings.resolution),
            fullscreen: instance.fullscreen ?? host.store.read().settings.fullscreen,
          },
          launcherName: 'NixelLauncher',
          launcherBrand: 'NixelLauncher',
          extraExecOption: { windowsHide: true },
        });
        const started = Date.now();
        stopped.delete(instance.id);
        processes.set(instance.id, process);
        task.report(100, tr('game.gameRunning'));
        host.running.add(instance.id);
        host.changed();
        const output: string[] = [];
        logs.set(instance.id, output);
        let logWrites = Promise.resolve();
        let logWriteFailed = false;
        const capture = (text: string) => {
          const line = redactLog(text, session.accessToken);
          output.push(line);
          task.log(line);
          logWrites = logWrites
            .then(() => appendFile(logPath, `${line}\n`, 'utf8'))
            .catch((error) => {
              if (!logWriteFailed)
                task.log(tr('game.couldNotWriteTheLaunchLogValue', { value1: String(error) }));
              logWriteFailed = true;
            });
          if (output.length > 2000) output.splice(0, output.length - 2000);
        };
        if (process.stdout) createInterface({ input: process.stdout }).on('line', capture);
        if (process.stderr) createInterface({ input: process.stderr }).on('line', capture);
        const exited = new Promise<number | null>((resolveExit, reject) => {
          process.once('error', reject);
          process.once('close', resolveExit);
        });
        const abort = () => process.kill();
        task.signal.addEventListener('abort', abort, { once: true });
        if (task.signal.aborted) abort();
        try {
          await host.store.update((draft) => {
            const item = draft.instances.find((entry) => entry.id === instance.id);
            if (item) item.lastPlayed = new Date().toISOString();
          });
          const code = await exited;
          capture(tr('game.gameExitedWithCodeValue', { value1: code }));
          if (code !== 0 && !task.signal.aborted && !stopped.has(instance.id))
            throw new Error(tr('game.gameCrashedValueCheckTheLaunchLog', { value1: code }));
          task.report(100, tr('game.gameStopped'));
        } catch (error) {
          process.kill();
          await exited.catch(() => undefined);
          throw error;
        } finally {
          await logWrites;
          task.signal.removeEventListener('abort', abort);
          processes.delete(instance.id);
          stopped.delete(instance.id);
          host.running.delete(instance.id);
          await host.store.update((draft) => {
            const item = draft.instances.find((entry) => entry.id === instance.id);
            if (item) {
              item.playTime += Date.now() - started;
              item.hours = tr('game.valueHours', { value1: (item.playTime / 3600000).toFixed(1) });
            }
          });
          host.changed();
        }
      },
      stop(id) {
        stopped.add(id);
        processes.get(id)?.kill();
      },
    };
    host.providers.register(
      ctx,
      {
        id: gameId,
        pluginId: gameId,
        kind: 'game',
        name: 'Minecraft · XMCL',
        capabilities: ['Vanilla', 'Fabric', 'Forge', 'NeoForge', 'Quilt'],
      },
      provider,
    );
    ctx.effect(() => () => {
      for (const process of processes.values()) process.kill();
    });
  },
};

export const instancesPlugin = {
  name: 'nixel.instances',
  inject: ['nixel'],
  async apply(ctx: Context) {
    const host = ctx.nixel;
    await cleanupPendingInstances(host);
    const command = commandsFor(ctx);
    command('game.versions', () =>
      host.providers
        .get<GameProvider>('game', host.store.read().settings.providers.game)
        .versions(),
    );
    command('game.loaders', ({ version, loader }: { version: string; loader: Loader }) =>
      host.providers
        .get<GameProvider>('game', host.store.read().settings.providers.game)
        .loaders(version, loader),
    );
    command('instances.create', async (input: CreateInstanceInput) => {
      host.providers.get<GameProvider>('game', host.store.read().settings.providers.game);
      const instance = await createInstance(host, input);
      return {
        instanceId: instance.id,
        taskId: input.install === false ? undefined : startInstall(host, instance.id),
      };
    });
    command('instances.update', async ({ id, patch }: { id: string; patch: Partial<Instance> }) => {
      getInstance(host, id);
      if (!patch || typeof patch !== 'object' || Array.isArray(patch))
        throw new Error(tr('game.invalidInstanceSettings'));
      validateLaunchOptions(patch, true);
      if (patch.name !== undefined) {
        if (typeof patch.name !== 'string' || !patch.name.trim())
          throw new Error(tr('game.theInstanceNameCannotBeEmpty'));
        patch.name = patch.name.trim();
      }
      if (
        patch.memory !== undefined &&
        patch.memory !== null &&
        (!Number.isInteger(patch.memory) || patch.memory < 256 || patch.memory > 262144)
      )
        throw new Error(tr('game.memoryMustBeBetween256And262144'));
      if (
        patch.account !== undefined &&
        (typeof patch.account !== 'string' ||
          (patch.account &&
            !host.store.read().accounts.some((account) => account.id === patch.account)))
      )
        throw new Error(tr('game.theSelectedAccountDoesNotExist'));
      if (patch.javaPath !== undefined) {
        if (typeof patch.javaPath !== 'string') throw new Error(tr('game.invalidJavaPath'));
        patch.javaPath = patch.javaPath.trim();
        if (
          patch.javaPath &&
          (!isAbsolute(patch.javaPath) || !(await stat(patch.javaPath)).isFile())
        )
          throw new Error(tr('game.chooseAnAbsolutePathToTheJava'));
      }
      if (patch.providers !== undefined) {
        assertInstanceIdle(host, id);
        if (
          !patch.providers ||
          typeof patch.providers !== 'object' ||
          Array.isArray(patch.providers)
        )
          throw new Error(tr('game.invalidInstanceProviderSettings'));
        for (const kind of Object.keys(patch.providers)) {
          if (kind !== 'game' && kind !== 'resources' && kind !== 'accounts')
            throw new Error(tr('game.invalidInstanceProviderType'));
          const providerId = patch.providers[kind];
          if (typeof providerId !== 'string') throw new Error(tr('game.invalidInstanceProvider'));
          if (kind !== 'accounts' || providerId) host.providers.get(kind, providerId);
        }
        patch.providers = { ...getInstance(host, id).providers, ...patch.providers };
      }
      await host.store.update((draft) => {
        const instance = draft.instances.find((entry) => entry.id === id);
        if (!instance) return;
        for (const key of [
          'name',
          'account',
          'memory',
          'javaPath',
          'jvmArgs',
          'gameArgs',
          'resolution',
          'fullscreen',
          'providers',
          'providerConfig',
        ] as const)
          if (patch[key] !== undefined) Object.assign(instance, { [key]: patch[key] });
      });
    });
    command(
      'instances.delete',
      async ({ id, deleteFiles }: { id: string; deleteFiles: boolean }) => {
        const instance = getInstance(host, id);
        if (
          host.running.has(id) ||
          instance.status === 'installing' ||
          host.tasks.list().some((task) => task.instanceId === id && task.status === 'running')
        )
          throw new Error(tr('game.stopThisInstanceSGameAndTasks'));
        if (deleteFiles) {
          const root = resolve(
            host.store.read().settings.instanceDirectory || host.store.instancesRoot,
          );
          const difference = relative(root, resolve(instance.directory));
          if (
            !difference ||
            difference === '..' ||
            difference.startsWith(`..${sep}`) ||
            isAbsolute(difference)
          )
            throw new Error(tr('game.theInstanceDirectoryIsOutsideTheManaged'));
          await rm(instance.directory, { recursive: true, force: true });
        }
        await host.store.update((draft) => {
          draft.instances = draft.instances.filter((entry) => entry.id !== id);
          draft.content = draft.content.filter((entry) => entry.instance !== id);
        });
      },
    );
    command('instances.install', ({ id }: { id: string }) => ({ taskId: startInstall(host, id) }));
    command('instances.launch', ({ id, accountId }: { id: string; accountId?: string }) => {
      const instance = getInstance(host, id);
      assertInstanceIdle(host, id);
      if (instance.status !== 'ready') throw new Error(tr('game.installThisInstanceFirst'));
      const selected =
        accountId ||
        instance.account ||
        host.store.read().settings.launchAccount ||
        host.store.read().settings.defaultAccount;
      const account: Account | undefined = host.store
        .read()
        .accounts.find((item) => item.id === selected);
      if (!account) throw new Error(tr('game.addAndSelectAGameAccountFirst'));
      return {
        taskId: host.tasks.start(
          tr('game.runValue', { value1: instance.name }),
          tr('game.preparingToLaunch'),
          async (task) => {
            const current = getInstance(host, id);
            assertInstanceIdle(host, id, task.taskId);
            if (current.status !== 'ready') throw new Error(tr('game.installThisInstanceFirst'));
            const state = host.store.read();
            const currentAccountId =
              accountId ||
              current.account ||
              state.settings.launchAccount ||
              state.settings.defaultAccount;
            const currentAccount = state.accounts.find((entry) => entry.id === currentAccountId);
            if (!currentAccount) throw new Error(tr('game.addAndSelectAGameAccountFirst'));
            await host.providers
              .get<GameProvider>('game', current.providers.game)
              .launch(current, currentAccount, task);
          },
          {
            instanceId: id,
            kind: 'launch',
            retry: { command: 'instances.launch', params: { id, accountId: account.id } },
          },
        ),
      };
    });
    command('instances.stop', ({ id }: { id: string }) =>
      host.providers.get<GameProvider>('game', getInstance(host, id).providers.game).stop(id),
    );
    command('instances.logs', async ({ id }: { id: string }) => {
      if (logs.has(id)) return logs.get(id);
      const directory = getInstance(host, id).directory;
      let text = await readFile(join(directory, 'nixel-launch.log'), 'utf8').catch(() =>
        readFile(join(directory, 'logs/latest.log'), 'utf8').catch(() => ''),
      );
      for (const account of host.store.read().accounts) {
        const stored = await host.platform.secretGet(`account:${account.id}`);
        if (stored)
          for (const token of Object.values(JSON.parse(stored) as Record<string, unknown>))
            if (typeof token === 'string' && token.length > 16)
              text = text.replaceAll(token, '[REDACTED]');
      }
      return redactLog(text).split(/\r?\n/).slice(-2000);
    });
    command(
      'instances.files',
      async ({ id, kind }: { id: string; kind: 'saves' | 'screenshots' | 'crash-reports' }) => {
        if (kind !== 'saves' && kind !== 'screenshots' && kind !== 'crash-reports')
          throw new Error(tr('game.unsupportedFileType'));
        const directory = join(getInstance(host, id).directory, kind);
        const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
        return Promise.all(
          entries
            .filter((entry) => !entry.isSymbolicLink())
            .map(async (entry): Promise<InstanceFile> => {
              const path = join(directory, entry.name);
              const info = await stat(path);
              return {
                name: entry.name,
                path,
                size: info.size,
                modifiedAt: info.mtime.toISOString(),
              };
            }),
        );
      },
    );
    command('java.list', () => discoverJava(join(host.store.root, 'java')));
    command('java.inspect', ({ path }: { path: string }) => inspectJava(path));
    command('java.install', ({ major }: { major: number }) => ({
      taskId: host.tasks.start(
        tr('game.installJavaValue', { value1: major }),
        tr('game.fetchingTheOfficialMojangJavaRuntime'),
        async (task) => {
          const runtime = await installJava(
            join(host.store.root, 'java'),
            major,
            taskProgress(task),
            host.store.read().settings.downloadConcurrency,
          );
          task.log(`Java ${runtime.version}：${runtime.path}`);
        },
        { kind: 'java', retry: { command: 'java.install', params: { major } } },
      ),
    }));
    registerModpacks(ctx);
    registerLocalInstances(ctx);
  },
};
