import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { Context } from 'cordis';
import { rcompare } from 'semver';
import { tr } from '../../shared/i18n';
import type { PluginInstallPreview, PluginRollbackTarget } from '../../shared/plugin-distribution';
import { download } from '../files';
import { unpackPlugin } from './archive';
import { httpsUrl, readCatalog } from './catalog';

export const pluginDistributionId = 'nixel.plugin-distribution';
export const pluginDistributionPlugin = {
  name: pluginDistributionId,
  inject: ['nixel'],
  apply(ctx: Context, config: { catalogUrl?: string }) {
    const host = ctx.nixel;
    const source = () => httpsUrl(config.catalogUrl);
    const requests = new Set<AbortController>();
    ctx.effect(() => () => {
      for (const request of requests) request.abort();
    });
    async function catalog(signal?: AbortSignal) {
      const value = await readCatalog(source(), signal);
      for (const item of value.packages) host.plugins.inspect(item.manifest);
      value.packages.sort(
        (a, b) =>
          a.manifest.id.localeCompare(b.manifest.id) ||
          rcompare(a.manifest.version, b.manifest.version),
      );
      return value;
    }
    host.commands.register(ctx, 'pluginCatalog.configure', async ({ url }: { url: string }) => {
      await host.commands.invoke('plugins.configure', {
        id: pluginDistributionId,
        config: { catalogUrl: httpsUrl(url) },
      });
    });
    host.commands.register(ctx, 'pluginCatalog.list', async () => {
      const request = new AbortController();
      requests.add(request);
      try {
        return { source: source(), ...(await catalog(request.signal)) };
      } finally {
        requests.delete(request);
      }
    });
    host.commands.register(
      ctx,
      'pluginCatalog.preview',
      async ({ id, version }: { id: string; version: string }) => {
        const request = new AbortController();
        requests.add(request);
        try {
          const item = (await catalog(request.signal)).packages.find(
            (item) => item.manifest.id === id && item.manifest.version === version,
          );
          if (!item) throw new Error(tr('pluginDist.changed'));
          const installed = host.snapshot().plugins.find((plugin) => plugin.id === id);
          return {
            source: source(),
            package: item,
            installedVersion: installed?.version,
            config: installed?.config ?? {},
            problems: host.plugins.inspect(item.manifest),
          } satisfies PluginInstallPreview;
        } finally {
          requests.delete(request);
        }
      },
    );
    host.commands.register(
      ctx,
      'pluginCatalog.install',
      ({ preview }: { preview: PluginInstallPreview }) => {
        if (!preview || preview.source !== source() || !preview.package)
          throw new Error(tr('pluginDist.changed'));
        host.plugins.inspect(preview.package.manifest);
        const { manifest } = preview.package;
        const taskId = host.tasks.start(
          tr('pluginDist.task', { name: manifest.name, version: manifest.version }),
          tr('pluginDist.download'),
          async (task) => {
            if (preview.source !== source()) throw new Error(tr('pluginDist.catalogChanged'));
            const selected = (await catalog(task.signal)).packages.find(
              (item) =>
                item.manifest.id === manifest.id && item.manifest.version === manifest.version,
            );
            if (!selected || !isDeepStrictEqual(selected, preview.package))
              throw new Error(tr('pluginDist.changed'));
            const root = join(host.store.cacheRoot, 'plugin-packages', randomUUID());
            await mkdir(root, { recursive: true });
            try {
              const archive = join(root, 'package.zip');
              const directory = join(root, 'content');
              const sourceUrl = new URL(preview.source);
              task.log(
                `${sourceUrl.origin}${sourceUrl.pathname}\n${manifest.id}@${manifest.version}\nSHA-256 ${selected.sha256}`,
              );
              await download(
                selected.url,
                archive,
                task.signal,
                { sha256: selected.sha256 },
                (current, total) =>
                  task.report(total ? (current / total) * 70 : 0, tr('pluginDist.download')),
              );
              task.report(75, tr('pluginDist.extract'));
              await unpackPlugin(archive, directory, task.signal);
              task.report(90, tr('pluginDist.apply'));
              await host.plugins.installManaged(ctx, directory, preview);
              task.report(100, tr('pluginDist.done'));
            } finally {
              try {
                await rm(root, { recursive: true, force: true });
              } catch (error) {
                task.log(String(error));
              }
            }
          },
          {
            kind: 'plugin-install',
            resourceId: manifest.id,
            retry: { command: 'pluginCatalog.install', params: { preview } },
          },
        );
        return { taskId };
      },
    );
    host.commands.register(
      ctx,
      'pluginCatalog.rollback',
      ({ id, target }: { id: string; target?: PluginRollbackTarget }) => {
        const managed = host.snapshot().plugins.find((plugin) => plugin.id === id)?.managed;
        if (!managed?.previous) throw new Error(tr('pluginDist.noRollback'));
        const selected = target ?? {
          id,
          current: managed.current.directory,
          previous: managed.previous.directory,
        };
        if (selected.id !== id) throw new Error(tr('pluginDist.changed'));
        return {
          taskId: host.tasks.start(
            tr('pluginDist.rollbackTask', { name: id }),
            tr('pluginDist.apply'),
            async (task) => {
              await host.plugins.rollback(ctx, selected);
              task.log(tr('pluginDist.restored'));
            },
            {
              kind: 'plugin-rollback',
              resourceId: id,
              retry: { command: 'pluginCatalog.rollback', params: { id, target: selected } },
            },
          ),
        };
      },
    );
  },
};
