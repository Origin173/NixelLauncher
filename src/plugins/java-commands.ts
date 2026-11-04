import { join } from 'node:path';
import type { Context } from 'cordis';
import { tr } from '../shared/i18n';
import { commandsFor } from './commands';
import { discoverJava, inspectJava, installJava } from './java';
import { taskProgress } from './task-progress';

export function registerJavaCommands(ctx: Context) {
  const host = ctx.nixel;
  const command = commandsFor(ctx);
  command('java.list', () => discoverJava(join(host.store.root, 'java')));
  command('java.inspect', ({ path }: { path: string }) => inspectJava(path));
  command('java.install', ({ major }: { major: number }) => ({
    taskId: host.tasks.start(
      tr('game.installJavaValue', { value1: major }),
      tr('game.fetchingTheOfficialMojangJavaRuntime'),
      async (task) => {
        const runtime = await installJava(join(host.store.root, 'java'), major, taskProgress(task));
        task.log(`Java ${runtime.version}：${runtime.path}`);
      },
      { kind: 'java', retry: { command: 'java.install', params: { major } } },
    ),
  }));
}
