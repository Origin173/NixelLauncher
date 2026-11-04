import type { Context } from 'cordis';
import type { Loader } from '../../shared/contracts';
import { type LoaderKind, listLoaderVersions, listMinecraftVersions } from '../minecraft-engine';
import type { GameProvider } from '../providers';
import { installGame } from './install';
import { MinecraftProcesses } from './processes';

export const gameId = 'nixel.game.minecraft';
export const gamePlugin = {
  name: gameId,
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    const runner = new MinecraftProcesses(host);
    const loaderKind = (loader: Loader): LoaderKind => {
      return loader.toLowerCase() as LoaderKind;
    };
    const provider: GameProvider = {
      versions: listMinecraftVersions,
      async loaders(version, loader, signal) {
        return (await listLoaderVersions(loaderKind(loader), version, signal)).map((id) => ({
          id,
          type: loader,
        }));
      },
      install: (instance, task) => installGame(host, instance, task),
      launch: (instance, account, task) => runner.launch(instance, account, task),
      stop: (id) => runner.stop(id),
    };
    host.providers.register(
      ctx,
      {
        id: gameId,
        pluginId: gameId,
        kind: 'game',
        name: 'Minecraft · Nixel',
        capabilities: ['Vanilla', 'Fabric', 'Forge', 'NeoForge', 'Quilt'],
      },
      provider,
    );
    ctx.effect(() => () => runner.dispose());
  },
};
