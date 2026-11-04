import { randomUUID } from 'node:crypto';
import type { Context } from 'cordis';
import { tr } from '../../shared/i18n';
import { parseServerAddress } from '../../shared/servers';
import { commandsFor } from '../commands';
import { getInstance } from '../instance-state';
import { queryServer } from './status';

export const serversPlugin = {
  name: 'nixel.servers',
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    const command = commandsFor(ctx);
    const pending = new Map<string, AbortController>();
    ctx.effect(() => () => {
      for (const controller of pending.values()) controller.abort();
    });
    command(
      'servers.save',
      async ({
        instanceId,
        id,
        name,
        address,
      }: {
        instanceId: string;
        id?: string;
        name: string;
        address: string;
      }) => {
        getInstance(host, instanceId);
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 100)
          throw new Error(tr('servers.invalidName'));
        const server = {
          id: id ?? randomUUID(),
          name: name.trim(),
          address: parseServerAddress(address).address,
        };
        await host.store.update((draft) => {
          const instance = draft.instances.find((entry) => entry.id === instanceId);
          if (!instance) throw new Error(tr('game.instanceNotFound'));
          instance.servers ??= [];
          const servers = instance.servers;
          if (id) {
            const index = servers.findIndex((entry) => entry.id === id);
            if (index < 0) throw new Error(tr('servers.notFound'));
            servers[index] = server;
          } else servers.push(server);
        });
        return server;
      },
    );
    command('servers.delete', async ({ instanceId, id }: { instanceId: string; id: string }) => {
      getInstance(host, instanceId);
      await host.store.update((draft) => {
        const instance = draft.instances.find((entry) => entry.id === instanceId);
        if (!instance) throw new Error(tr('game.instanceNotFound'));
        instance.servers = (instance.servers ?? []).filter((entry) => entry.id !== id);
      });
    });
    command(
      'servers.status',
      async ({
        instanceId,
        id,
        requestId,
      }: {
        instanceId: string;
        id: string;
        requestId: string;
      }) => {
        if (typeof requestId !== 'string' || !/^[\w-]{1,80}$/.test(requestId))
          throw new Error(tr('servers.invalidResponse'));
        const server = getInstance(host, instanceId).servers?.find((entry) => entry.id === id);
        if (!server) throw new Error(tr('servers.notFound'));
        pending.get(requestId)?.abort();
        const controller = new AbortController();
        pending.set(requestId, controller);
        try {
          return await queryServer(server.address, controller.signal);
        } finally {
          if (pending.get(requestId) === controller) pending.delete(requestId);
        }
      },
    );
    command('servers.cancel', ({ requestId }: { requestId: string }) => {
      pending.get(requestId)?.abort();
    });
  },
};
