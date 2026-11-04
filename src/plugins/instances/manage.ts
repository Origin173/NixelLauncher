import { rm, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Context } from 'cordis';
import type { CreateInstanceInput, Instance } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import { validateLaunchOptions } from '../../shared/launch-options';
import { commandsFor } from '../commands';
import { assertInstanceIdle, createInstance, getInstance } from '../instance-state';
import type { GameProvider } from '../providers';
import { startInstall } from './install';

export function registerInstanceManagement(ctx: Context) {
  const host = ctx.nixel;
  const command = commandsFor(ctx);
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
      if (patch.javaPath && (!isAbsolute(patch.javaPath) || !(await stat(patch.javaPath)).isFile()))
        throw new Error(tr('game.chooseAnAbsolutePathToTheJava'));
    }
    if (patch.providers !== undefined || patch.providerConfig !== undefined)
      assertInstanceIdle(host, id);
    if (patch.providers !== undefined) {
      if (!patch.providers || typeof patch.providers !== 'object' || Array.isArray(patch.providers))
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
  command('instances.delete', async ({ id, deleteFiles }: { id: string; deleteFiles: boolean }) => {
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
      if (draft.settings.launchInstance === id) {
        draft.settings.launchInstance = draft.instances[0]?.id ?? '';
        draft.settings.launchAccount = '';
      }
    });
  });
  command('instances.install', ({ id }: { id: string }) => ({ taskId: startInstall(host, id) }));
}
