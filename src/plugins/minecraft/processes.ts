import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Account, Instance } from '../../shared/contracts';
import type { NixelHost, TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import type { GameLaunchOptions } from '../../shared/servers';
import { selectJava } from '../java-selection';
import { createLaunchLog } from '../launch-logs';
import { launchMinecraft } from '../minecraft-launch';
import { readVersion } from '../minecraft-version';
import type { AccountProvider } from '../providers';

export class MinecraftProcesses {
  private processes = new Map<string, ChildProcess>();
  private stopped = new Set<string>();
  constructor(private readonly host: NixelHost) {}
  async launch(
    instance: Instance,
    account: Account,
    task: TaskContext,
    options?: GameLaunchOptions,
  ) {
    const host = this.host;
    if (host.running.has(instance.id)) throw new Error(tr('game.thisInstanceIsAlreadyRunning'));
    const accountProvider = host.providers.get<AccountProvider>(
      'accounts',
      instance.providers.accounts || account.provider,
    );
    if (instance.providers.accounts && account.provider !== instance.providers.accounts)
      throw new Error(tr('game.theAccountDoesNotMatchTheInstance'));
    const version = await readVersion(
      instance.directory,
      instance.launchVersion || instance.version,
    );
    const java = await selectJava(host, instance, version.javaVersion?.majorVersion ?? 8, task);
    const session = await accountProvider.session(account, task.signal);
    task.signal.throwIfAborted();
    task.report(0, tr('game.startingTheGame'));
    const logPath = join(instance.directory, 'nixel-launch.log');
    const log = await createLaunchLog(instance.id, logPath, task, session.accessToken);
    const memory = instance.memory ?? host.store.read().settings.memory;
    const { process, dispose } = await launchMinecraft({
      ...session,
      server: options?.server,
      version,
      gamePath: instance.directory,
      javaPath: java.path,
      javaMajor: java.major,
      signal: task.signal,
      maxMemory: memory,
      minMemory: Math.min(512, memory),
      extraJVMArgs: instance.jvmArgs ?? host.store.read().settings.jvmArgs,
      extraMCArgs: instance.gameArgs ?? host.store.read().settings.gameArgs,
      resolution: {
        ...(instance.resolution ?? host.store.read().settings.resolution),
        fullscreen: instance.fullscreen ?? host.store.read().settings.fullscreen,
      },
    });
    const started = Date.now();
    this.stopped.delete(instance.id);
    this.processes.set(instance.id, process);
    task.report(100, tr('game.gameRunning'));
    host.running.add(instance.id);
    host.changed();
    if (process.stdout) createInterface({ input: process.stdout }).on('line', log.capture);
    if (process.stderr) createInterface({ input: process.stderr }).on('line', log.capture);
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
      log.capture(tr('game.gameExitedWithCodeValue', { value1: code }));
      if (code !== 0 && !task.signal.aborted && !this.stopped.has(instance.id))
        throw new Error(tr('game.gameCrashedValueCheckTheLaunchLog', { value1: code }));
      task.report(100, tr('game.gameStopped'));
    } catch (error) {
      process.kill();
      await exited.catch(() => undefined);
      throw error;
    } finally {
      await log.flush();
      task.signal.removeEventListener('abort', abort);
      this.processes.delete(instance.id);
      this.stopped.delete(instance.id);
      host.running.delete(instance.id);
      await host.store.update((draft) => {
        const item = draft.instances.find((entry) => entry.id === instance.id);
        if (item) {
          item.playTime += Date.now() - started;
          item.hours = tr('game.valueHours', { value1: (item.playTime / 3600000).toFixed(1) });
        }
      });
      host.changed();
      await dispose();
    }
  }

  stop(id: string) {
    this.stopped.add(id);
    this.processes.get(id)?.kill();
  }
  dispose() {
    for (const process of this.processes.values()) process.kill();
  }
}
