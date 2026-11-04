import { join } from 'node:path';
import type { Instance } from '../shared/contracts';
import type { NixelHost, TaskContext } from '../shared/host-api';
import { tr } from '../shared/i18n';
import { discoverJava, inspectJava, installJava } from './java';
import { taskProgress } from './task-progress';

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
    return installJava(join(host.store.root, 'java'), major, taskProgress(task));
  if (!runtime) throw new Error(tr('game.thisVersionRequiresJavaValueChooseA', { value1: major }));
  if (runtime.major !== major)
    throw new Error(
      tr('game.thisVersionRequiresJavaValueJavaValue', { value1: major, value2: runtime.major }),
    );
  return runtime;
}
