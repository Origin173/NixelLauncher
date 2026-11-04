import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { InstanceBackup } from '../../../shared/contracts';
import type { NixelHost, TaskContext } from '../../../shared/host-api';
import { tr } from '../../../shared/i18n';
import { hashFile, inside } from '../../files';
import { assertInstanceIdle, createInstance, getInstance } from '../../instance-state';
import { packInstance, unpackInstance } from './archive';
import type { BackupRepository } from './repository';
import { pruneBackups } from './retention';

export async function createBackup(
  host: NixelHost,
  repository: BackupRepository,
  id: string,
  task: TaskContext,
  origin: NonNullable<InstanceBackup['origin']> = 'manual',
) {
  assertInstanceIdle(host, id, task.taskId);
  const instance = structuredClone(getInstance(host, id));
  const content = structuredClone(
    host.store.read().content.filter((entry) => entry.instance === id),
  );
  const pending = await repository.begin();
  try {
    const files = await packInstance(instance.directory, pending.archive, task);
    task.report(95, tr('backups.verifying'));
    const sha256 = await hashFile(pending.archive, 'sha256', task.signal);
    task.signal.throwIfAborted();
    await repository.commit(pending.staging, {
      formatVersion: 1,
      sha256,
      backup: {
        origin,
        id: pending.id,
        instanceId: id,
        instanceName: instance.name,
        version: instance.version,
        loader: instance.loader,
        createdAt: new Date().toISOString(),
        size: 0,
        files,
      },
      instance,
      content,
    });
    if (origin === 'version-change' || origin === 'modpack-upgrade')
      await pruneBackups(host, repository, id, pending.id, task);
    task.report(100, tr('backups.created'));
    return pending.id;
  } finally {
    await rm(pending.staging, { recursive: true, force: true });
  }
}

export async function restoreBackup(
  host: NixelHost,
  repository: BackupRepository,
  id: string,
  task: TaskContext,
) {
  const manifest = await repository.read(id);
  const archive = join(repository.directory(id), 'instance.zip');
  task.report(0, tr('backups.verifying'));
  if ((await hashFile(archive, 'sha256', task.signal)) !== manifest.sha256)
    throw new Error(tr('backups.checksumMismatch'));
  const original = manifest.instance;
  const root = resolve(host.store.read().settings.instanceDirectory || host.store.instancesRoot);
  const instance = await createInstance(
    host,
    {
      name: tr('backups.restoredName', { name: original.name }),
      version: original.version,
      loader: original.loader,
      loaderVersion: original.loaderVersion,
      install: false,
    },
    { taskId: task.taskId, root },
  );
  task.setInstance(instance.id);
  try {
    await unpackInstance(archive, instance.directory, task);
    task.signal.throwIfAborted();
    await host.store.update((draft) => {
      const item = draft.instances.find((entry) => entry.id === instance.id);
      if (!item) throw new Error(tr('game.instanceNotFound'));
      Object.assign(item, original, {
        id: instance.id,
        name: instance.name,
        directory: instance.directory,
        createdAt: instance.createdAt,
        pendingOperation: undefined,
        account: draft.accounts.some((account) => account.id === original.account)
          ? original.account
          : '',
      });
      draft.content.push(
        ...manifest.content.map((entry) => ({
          ...entry,
          id: randomUUID(),
          instance: instance.id,
          update: undefined,
        })),
      );
    });
    task.report(100, tr('backups.restored', { name: instance.name }));
    task.log(tr('backups.restored', { name: instance.name }));
  } catch (error) {
    await rm(inside(root, instance.id), { recursive: true, force: true });
    await host.store.update((draft) => {
      draft.instances = draft.instances.filter((entry) => entry.id !== instance.id);
      draft.content = draft.content.filter((entry) => entry.instance !== instance.id);
    });
    throw error;
  }
}
