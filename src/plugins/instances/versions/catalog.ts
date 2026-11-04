import type { Context } from 'cordis';
import type { Loader } from '../../../shared/contracts';
import type { NixelHost } from '../../../shared/host-api';
import { commandsFor } from '../../commands';
import { getInstance } from '../../instance-state';
import type { GameProvider } from '../../providers';

export function gameProvider(host: NixelHost, instanceId?: string) {
  const id = instanceId
    ? getInstance(host, instanceId).providers.game
    : host.store.read().settings.providers.game;
  return host.providers.get<GameProvider>('game', id);
}

export function registerVersionCatalog(ctx: Context) {
  const command = commandsFor(ctx);
  command('game.versions', (params?: { instanceId?: string }) =>
    gameProvider(ctx.nixel, params?.instanceId).versions(),
  );
  command(
    'game.loaders',
    ({ version, loader, instanceId }: { version: string; loader: Loader; instanceId?: string }) =>
      gameProvider(ctx.nixel, instanceId).loaders(version, loader),
  );
}
