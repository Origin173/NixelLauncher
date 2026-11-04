import type { Context } from 'cordis';
import { getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { tr } from '../../shared/i18n';
import { commandsFor } from '../commands';
import { networkConfiguration } from './configuration';
import { networkDispatcher } from './dispatcher';

export const networkId = 'nixel.network';
export const networkPlugin = {
  name: networkId,
  inject: ['nixel'],
  async apply(ctx: Context, value: Record<string, unknown>) {
    const config = networkConfiguration(value);
    const platform = ctx.nixel.platform;
    await platform.configureProxy(config);
    const previous = getGlobalDispatcher();
    const network = networkDispatcher(config, (url) => platform.resolveProxy(url));
    setGlobalDispatcher(network.dispatcher);
    console.info(`[${networkId}] ${config.mode}`);
    ctx.effect(() => async () => {
      setGlobalDispatcher(previous);
      await network.dispose();
      await platform.configureProxy({ mode: 'system', proxyUrl: '' });
    });
    const command = commandsFor(ctx);
    command('network.configure', (input: Record<string, unknown>) =>
      ctx.nixel.commands.invoke('plugins.configure', {
        id: networkId,
        config: networkConfiguration(input),
      }),
    );
    command('network.status', () => ({ ...config }));
    command('network.check', () => ({
      taskId: ctx.nixel.tasks.start(
        tr('network.check'),
        tr('network.checking'),
        async (task) => {
          const targets = [
            ['Minecraft', 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'],
            ['Modrinth', 'https://api.modrinth.com/v2/tag/game_version'],
          ] as const;
          for (const [index, [name, url]] of targets.entries()) {
            task.log(tr('network.contacting', { name }));
            const response = await fetch(url, {
              signal: AbortSignal.any([task.signal, AbortSignal.timeout(15_000)]),
            });
            await response.body?.cancel();
            if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
            task.log(tr('network.connected', { name }));
            task.report(((index + 1) / targets.length) * 100);
          }
        },
        { kind: 'network', retry: { command: 'network.check', params: {} } },
      ),
    }));
  },
};
