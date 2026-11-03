import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { NixelHost } from '../shared/host-api';
import { inside } from './files';

/** Remove only interrupted, launcher-created instances before accepting commands. */
export async function cleanupPendingInstances(host: NixelHost) {
  for (const instance of host.store.read().instances) {
    if (
      host.running.has(instance.id) ||
      host.tasks
        .list()
        .some(
          (task) =>
            task.status === 'running' &&
            (task.instanceId === instance.id || task.id === instance.pendingOperation?.taskId),
        )
    )
      continue;
    const pending = instance.pendingOperation;
    if (!pending) {
      if (instance.status === 'installing')
        await host.store.update((draft) => {
          const item = draft.instances.find((entry) => entry.id === instance.id);
          if (item) {
            item.status = 'not-installed';
            item.error = '上次安装已中断，请重试安装';
          }
        });
      continue;
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(instance.id))
      throw new Error('未完成实例的 ID 无效，未清理目录');
    const target = inside(pending.root, instance.id);
    if (target !== resolve(instance.directory))
      throw new Error('未完成实例的目录边界不匹配，未清理目录');
    await rm(target, { recursive: true, force: true });
    await host.store.update((draft) => {
      draft.instances = draft.instances.filter((entry) => entry.id !== instance.id);
      draft.content = draft.content.filter((entry) => entry.instance !== instance.id);
    });
  }
}
