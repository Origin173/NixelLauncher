import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { NixelHost, TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import type { PackProvenance } from '../../shared/modpack-contracts';
import { inside } from '../files';
import { createInstance } from '../instance-state';
import type { GameProvider } from '../providers';
import { readPack } from './archive';
import { captureBaseline, materializePack } from './materialize';
import { contentRecords } from './metadata';
export async function importModpack(
  host: NixelHost,
  path: string,
  task: TaskContext,
  name?: string,
  provenance?: PackProvenance,
) {
  const pack = await readPack(host, path);
  const {
    zip,
    index,
    target: { version, loader, loaderVersion },
    curseForgeProvider,
  } = pack;
  let createdInstance: { id: string; directory: string; root: string } | undefined;
  try {
    task.signal.throwIfAborted();
    const instancesRoot = resolve(
      host.store.read().settings.instanceDirectory || host.store.instancesRoot,
    );
    const instance = await createInstance(
      host,
      {
        name: name || index.name,
        version,
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
    const files = await materializePack(pack, instance, task);
    const baseline = await captureBaseline(
      pack,
      instance.directory,
      files,
      provenance,
      task.signal,
    );
    task.signal.throwIfAborted();
    await host.store.update((draft) => {
      const item = draft.instances.find((entry) => entry.id === instance.id);
      if (item) {
        item.status = 'ready';
        item.launchVersion = launchVersion;
        item.pendingOperation = undefined;
        item.modpack = baseline;
        draft.content.push(...contentRecords(instance.id, files.content));
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
