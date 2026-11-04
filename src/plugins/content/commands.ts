import { rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Context } from 'cordis';
import { tr } from '../../shared/i18n';
import { commandsFor } from '../commands';
import { inside } from '../files';
import { assertInstanceIdle, getInstance } from '../instance-state';
import { contentDirectories, scanContent } from '../resource-files';
export function registerContentFiles(ctx: Context) {
  const host = ctx.nixel;
  const command = commandsFor(ctx);
  command('content.list', ({ instanceId }: { instanceId: string }) => {
    const instance = getInstance(host, instanceId);
    return host.tasks
      .list()
      .some((task) => task.instanceId === instanceId && task.status === 'running')
      ? host.store.read().content.filter((entry) => entry.instance === instanceId)
      : scanContent(host, instance);
  });
  command(
    'content.setEnabled',
    async ({ instanceId, id, enabled }: { instanceId: string; id: string; enabled: boolean }) => {
      const instance = getInstance(host, instanceId);
      assertInstanceIdle(host, instanceId);
      const entry = host.store
        .read()
        .content.find((entry) => entry.instance === instanceId && entry.id === id);
      if (!entry) throw new Error(tr('resources.fileNotFoundRefreshTheList'));
      if (entry.enabled === enabled) return;
      const fileName = enabled
        ? entry.fileName.replace(/\.disabled$/, '')
        : `${entry.fileName}.disabled`;
      const directory = join(instance.directory, contentDirectories[entry.category]);
      const target = inside(directory, fileName);
      if (
        await stat(target).then(
          () => true,
          () => false,
        )
      )
        throw new Error(tr('resources.targetFileAlreadyExists'));
      await rename(inside(directory, entry.fileName), target);
      await host.store.update((draft) => {
        const item = draft.content.find((entry) => entry.id === id);
        if (item) {
          item.enabled = enabled;
          item.fileName = fileName;
        }
      });
    },
  );
  command('content.remove', async ({ instanceId, id }: { instanceId: string; id: string }) => {
    const instance = getInstance(host, instanceId);
    assertInstanceIdle(host, instanceId);
    const entry = host.store
      .read()
      .content.find((entry) => entry.instance === instanceId && entry.id === id);
    if (!entry) throw new Error(tr('resources.fileNotFound'));
    await rm(inside(join(instance.directory, contentDirectories[entry.category]), entry.fileName), {
      force: true,
    });
    await host.store.update((draft) => {
      draft.content = draft.content.filter((entry) => entry.id !== id);
    });
  });
}
