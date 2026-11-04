import { join } from 'node:path';
import type { Context } from 'cordis';
import { type DownloadConfiguration, downloadsId } from '../../shared/downloads';
import { tr, translatedName } from '../../shared/i18n';
import { commandsFor } from '../commands';
import { DownloadScheduler } from './scheduler';

function configuration(value: Record<string, unknown>, legacy: number): DownloadConfiguration {
  const concurrency = value.concurrency ?? legacy;
  const bytesPerSecond = value.bytesPerSecond ?? 0;
  if (
    typeof concurrency !== 'number' ||
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 32 ||
    typeof bytesPerSecond !== 'number' ||
    !Number.isSafeInteger(bytesPerSecond) ||
    bytesPerSecond < 0 ||
    bytesPerSecond > 1024 ** 3
  )
    throw new Error(tr('downloads.invalidConfiguration'));
  return { concurrency, bytesPerSecond };
}

export const downloadsPlugin = {
  name: downloadsId,
  inject: ['nixel'],
  apply(ctx: Context, value: Record<string, unknown>) {
    const host = ctx.nixel;
    const config = configuration(value, host.store.read().settings.downloadConcurrency);
    const scheduler = new DownloadScheduler(join(host.store.cacheRoot, 'downloads'), config);
    ctx.effect(() => () => scheduler.dispose());
    host.providers.register(
      ctx,
      {
        id: downloadsId,
        pluginId: downloadsId,
        kind: 'downloads',
        ...translatedName('downloads.plugin'),
      },
      scheduler,
    );
    const command = commandsFor(ctx);
    command('downloads.status', () => config);
    command('downloads.configure', (input: Record<string, unknown>) =>
      host.commands.invoke('plugins.configure', {
        id: downloadsId,
        config: configuration(input, config.concurrency),
      }),
    );
  },
};
