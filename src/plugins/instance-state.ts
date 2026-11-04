import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CreateInstanceInput, Instance } from '../shared/contracts';
import type { NixelHost } from '../shared/host-api';
import { tr } from '../shared/i18n';

export function getInstance(host: NixelHost, id: string) {
  const instance = host.store.read().instances.find((item) => item.id === id);
  if (!instance) throw new Error(tr('game.instanceNotFound'));
  return instance;
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
