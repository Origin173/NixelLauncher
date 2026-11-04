import { errorMessage } from '../../shared/error-message';
import type { NixelHost } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { assertInstanceIdle, getInstance } from '../instance-state';
import type { GameProvider } from '../providers';

export function startInstall(host: NixelHost, id: string) {
  const instance = getInstance(host, id);
  assertInstanceIdle(host, id);
  return host.tasks.start(
    tr('game.installValue', { value1: instance.name }),
    tr('game.preparingInstallation'),
    async (task) => {
      const instance = getInstance(host, id);
      assertInstanceIdle(host, id, task.taskId);
      const provider = host.providers.get<GameProvider>('game', instance.providers.game);
      await host.store.update((draft) => {
        const item = draft.instances.find((entry) => entry.id === id);
        if (item) {
          item.status = 'installing';
          item.error = undefined;
        }
      });
      try {
        const version = await provider.install(instance, task);
        await host.store.update((draft) => {
          const item = draft.instances.find((entry) => entry.id === id);
          if (item) {
            item.status = 'ready';
            item.launchVersion = version;
          }
        });
      } catch (error) {
        await host.store.update((draft) => {
          const item = draft.instances.find((entry) => entry.id === id);
          if (item) {
            item.status = task.signal.aborted ? 'not-installed' : 'error';
            item.error = task.signal.aborted
              ? tr('game.installationCancelledYouCanRetryIt')
              : errorMessage(error);
          }
        });
        throw error;
      }
    },
    { instanceId: id, kind: 'install', retry: { command: 'instances.install', params: { id } } },
  );
}
