import { randomUUID } from 'node:crypto';
import { Context } from 'cordis';
import { builtinPlugins } from '../plugins/builtin';
import type { HostPlatform } from '../shared/host-api';
import { tr } from '../shared/i18n';
import { NixelService } from './core';
import { HostPlugins } from './plugins';
import type { HostToMain, MainToHost, PlatformOperation } from './protocol';

const port = process.parentPort;
const root = new Context();
let service: NixelService | undefined;
const platformRequests = new Map<
  string,
  {
    resolve(value: unknown): void;
    reject(error: Error): void;
  }
>();

function send(message: HostToMain) {
  port.postMessage(message);
}

function platform<T>(operation: PlatformOperation, payload?: unknown): Promise<T> {
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    platformRequests.set(id, { resolve: (value) => resolve(value as T), reject });
    send({ type: 'platform', id, operation, payload });
  });
}

const system: HostPlatform = {
  configureProxy: (config) => platform('network.configure', config),
  resolveProxy: (url) => platform('network.resolveProxy', { url }),
  secretGet: (key) => platform('secret.get', { key }),
  secretSet: (key, value) => platform('secret.set', { key, value }),
  secretDelete: (key) => platform('secret.delete', { key }),
  openExternal: (url) => platform('url.open', { url }),
};

async function handle(message: MainToHost) {
  switch (message.type) {
    case 'initialize': {
      service = new NixelService(root, message.configuration, system, (snapshot) => {
        send({ type: 'snapshot', snapshot });
      });
      await service.initialize();
      const plugins = new HostPlugins(root, service, (path) => platform('ui.load', { path }));
      await plugins.initialize(builtinPlugins);
      service.ready = true;
      send({ type: 'snapshot', snapshot: service.snapshot() });
      send({ type: 'ready' });
      break;
    }
    case 'command': {
      try {
        if (!service) throw new Error(tr('index.thePluginHostIsNotReady'));
        const value = await service.commands.invoke(message.command, message.payload);
        send({ type: 'command-result', id: message.id, value });
      } catch (error) {
        send({
          type: 'command-result',
          id: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      break;
    }
    case 'platform-result': {
      const request = platformRequests.get(message.id);
      if (!request) break;
      platformRequests.delete(message.id);
      if (message.error) request.reject(new Error(message.error));
      else request.resolve(message.value);
      break;
    }
    case 'shutdown':
      await service?.tasks.dispose();
      await root.fiber.dispose();
      process.exit(0);
  }
}

port.on('message', ({ data }: { data: MainToHost }) => {
  void handle(data).catch((error: unknown) => {
    send({ type: 'fatal', error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  });
});
