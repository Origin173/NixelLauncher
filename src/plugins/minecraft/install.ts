import type { Instance, Loader } from '../../shared/contracts';
import type { NixelHost, TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { selectJava } from '../java-selection';
import {
  installMinecraft,
  type LoaderKind,
  listLoaderVersions,
  requiredJava,
} from '../minecraft-engine';
import { taskProgress } from '../task-progress';

export async function installGame(host: NixelHost, instance: Instance, task: TaskContext) {
  const loaderKind = (loader: Loader) => loader.toLowerCase() as LoaderKind;
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
}
