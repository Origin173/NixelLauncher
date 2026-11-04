import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Context, Plugin } from 'cordis';
import type { NixelPluginManifest, PluginItem } from '../shared/contracts';
import type { BuiltinPlugin } from '../shared/host-api';
import { tr, translatedName, withTranslations } from '../shared/i18n';
import type { PluginInstallPreview, PluginRollbackTarget } from '../shared/plugin-distribution';
import type { NixelService } from './core';
import { dependencyProblems } from './plugin-management/dependencies';
import {
  dependencies,
  entryPath,
  readManifest,
  validateConfig,
  validateManifest,
} from './plugin-management/manifest';
import { PluginTransactions } from './plugin-management/transactions';
import type { InstalledPlugin } from './plugin-management/types';
import { validateSettings } from './settings';

export class HostPlugins {
  private entries = new Map<string, InstalledPlugin>();
  private revision = 0;
  private pending: Promise<unknown> = Promise.resolve();
  private transactions: PluginTransactions;

  constructor(
    private ctx: Context,
    private host: NixelService,
    private loadInterface: (path: string) => Promise<void>,
  ) {
    this.transactions = new PluginTransactions(
      host,
      this.entries,
      (action) => this.serial(action),
      (manifest, builtin, directory) => this.item(manifest, builtin, directory),
      (manifest) => this.inspect(manifest),
      (id, ancestors) => this.enable(id, ancestors),
      () => this.save(),
      () => this.changed(),
    );
  }

  private item(manifest: NixelPluginManifest, builtin: boolean, directory?: string): PluginItem {
    const persisted = this.host.store.read().plugins[manifest.id];
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      desc: manifest.description,
      category: manifest.category,
      enabled: persisted?.enabled ?? true,
      installed: true,
      builtin,
      official: builtin,
      status: 'disabled',
      directory,
      color: builtin ? '#7f8f62' : '#b28b70',
      config: persisted?.config ?? {},
      manifest,
      managed: persisted?.managed,
    };
  }

  private changed() {
    this.host.pluginSnapshot = [...this.entries.values()].map(({ item }) => item);
    this.host.changed();
  }

  private serial<T>(action: () => T | Promise<T>): Promise<T> {
    const result = this.pending.then(action);
    this.pending = result.catch(() => {});
    return result;
  }

  inspect(input: NixelPluginManifest) {
    const manifest = validateManifest(input);
    const current = this.entries.get(manifest.id)?.item;
    const problems = dependencyProblems(
      manifest,
      [...this.entries.values()].map((entry) => entry.item),
    );
    if (current && (current.builtin || !current.managed))
      problems.unshift(tr('pluginDist.immutable'));
    return problems;
  }

  installManaged(ctx: Context, directory: string, preview: PluginInstallPreview) {
    return this.transactions.installManaged(ctx, directory, preview);
  }
  rollback(ctx: Context, target: PluginRollbackTarget) {
    return this.transactions.rollback(ctx, target);
  }

  async initialize(builtins: BuiltinPlugin[]) {
    const defaults: BuiltinPlugin = {
      manifest: withTranslations(
        {
          id: 'nixel.ui.default',
          name: tr('plugins.nixelDefaultInterface'),
          version: '1.0.0',
          description: tr('plugins.theBuiltInNixellauncherInterface'),
          apiVersion: 1,
          category: tr('plugins.interface'),
        },
        {
          name: 'plugins.nixelDefaultInterface',
          description: 'plugins.theBuiltInNixellauncherInterface',
          category: 'plugins.interface',
        },
      ),
      plugin: (ctx: Context) => {
        ctx.nixel.providers.register(
          ctx,
          {
            id: 'nixel.ui.default',
            pluginId: 'nixel.ui.default',
            kind: 'interface',
            ...translatedName('plugins.nixelDefaultInterface'),
          },
          {},
        );
      },
    };
    for (const builtin of [defaults, ...builtins]) {
      this.entries.set(builtin.manifest.id, {
        item: this.item(builtin.manifest, true),
        plugin: builtin.plugin,
      });
    }
    for (const [id, persisted] of Object.entries(this.host.store.read().plugins)) {
      if (!persisted.directory || this.entries.has(id)) continue;
      try {
        const manifest = await readManifest(persisted.directory);
        if (manifest.id !== id) throw new Error(tr('plugins.thePluginIdDoesNotMatchIts'));
        this.entries.set(id, { item: this.item(manifest, false, persisted.directory) });
      } catch (error) {
        const manifest: NixelPluginManifest = {
          id,
          name: id,
          version: '?',
          description: tr('plugins.cannotReadTheLocalPlugin'),
          apiVersion: 1,
          category: tr('plugins.local'),
        };
        const item = this.item(manifest, false, persisted.directory);
        item.status = 'error';
        item.error = String(error);
        this.entries.set(id, { item });
      }
    }
    for (const [id, entry] of this.entries) {
      if (entry.item.enabled && entry.item.status !== 'error') await this.enable(id, new Set());
    }
    await this.save();
    this.registerCommands();
    const selected = this.host.store.read().settings.interfacePlugin;
    if (selected !== 'nixel.ui.default') {
      try {
        await this.selectInterface(selected);
      } catch {
        await this.host.store.update((state) => {
          state.settings.interfacePlugin = 'nixel.ui.default';
        });
      }
    }
    this.changed();
  }

  private async enable(id: string, ancestors: Set<string>) {
    const entry = this.require(id);
    if (entry.fiber || entry.item.status === 'active') return;
    if (ancestors.has(id))
      throw new Error(tr('plugins.circularPluginDependencyValue', { value1: id }));
    try {
      validateConfig(entry.item.manifest, entry.item.config);
      const problems = dependencyProblems(
        entry.item.manifest,
        [...this.entries.values()].map((value) => value.item),
      );
      if (problems.length) throw new Error(problems.join('\n'));
      const next = new Set(ancestors).add(id);
      for (const dependency of Object.keys(dependencies(entry.item.manifest))) {
        if (!this.require(dependency).item.enabled)
          throw new Error(tr('plugins.enableThisDependencyFirstValue', { value1: dependency }));
        await this.enable(dependency, next);
        if (this.require(dependency).item.status !== 'active')
          throw new Error(tr('plugins.failedToLoadDependencyValue', { value1: dependency }));
      }
      let plugin = entry.plugin;
      if (!entry.item.builtin && entry.item.manifest.main && entry.item.directory) {
        const path = await entryPath(entry.item.directory, entry.item.manifest.main);
        const module = await import(
          /* @vite-ignore */ `${pathToFileURL(path).href}?nixel=${++this.revision}`
        );
        plugin = module.default ?? module;
      }
      const manifest = entry.item.manifest;
      const applied: Plugin = plugin ?? (() => {});
      const effective: Plugin =
        manifest.renderer && entry.item.directory
          ? {
              name: manifest.id,
              async apply(ctx: Context, config: Record<string, unknown>) {
                await ctx.plugin(applied, config);
                ctx.nixel.providers.register(
                  ctx,
                  {
                    id: manifest.id,
                    pluginId: manifest.id,
                    kind: 'interface',
                    name: manifest.name,
                  },
                  {},
                );
              },
            }
          : applied;
      entry.fiber = this.ctx.plugin(effective, entry.item.config);
      await entry.fiber.await();
      entry.item.enabled = true;
      entry.item.status = 'active';
      delete entry.item.error;
    } catch (error) {
      await entry.fiber?.dispose();
      entry.fiber = undefined;
      entry.item.status = 'error';
      entry.item.error = error instanceof Error ? error.message : String(error);
    }
    this.changed();
  }

  private require(id: string) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(tr('plugins.pluginIsNotInstalledValue', { value1: id }));
    return entry;
  }

  private async disable(id: string) {
    const entry = this.require(id);
    this.assertIdle(entry);
    if (this.host.store.read().settings.interfacePlugin === id)
      throw new Error(tr('plugins.switchToAnotherInterfaceFirst'));
    const dependents = [...this.entries.values()].filter(
      (plugin) => plugin.item.status === 'active' && id in dependencies(plugin.item.manifest),
    );
    if (dependents.length)
      throw new Error(
        tr('plugins.disableValueWhichDependsOnThisPlugin', {
          value1: dependents.map((plugin) => plugin.item.name).join('、'),
        }),
      );
    await entry.fiber?.dispose();
    entry.fiber = undefined;
    entry.item.enabled = false;
    entry.item.status = 'disabled';
    delete entry.item.error;
    this.changed();
  }

  private assertIdle(entry: InstalledPlugin) {
    if (!entry.item.manifest.main && !entry.plugin) return;
    if (
      this.host.running.size ||
      this.host.tasks.list().some((task) => task.status === 'running')
    ) {
      throw new Error(tr('plugins.stopGamesAndCancelActiveTasksBefore'));
    }
  }

  private save() {
    return this.host.store.update((state) => {
      state.plugins = Object.fromEntries(
        [...this.entries].map(([id, { item }]) => [
          id,
          {
            enabled: item.enabled,
            directory: item.directory,
            config: item.config,
            managed: item.managed,
          },
        ]),
      );
    });
  }

  private async selectInterface(id: string) {
    const entry = this.require(id);
    if (entry.item.status !== 'active')
      throw new Error(tr('plugins.theSelectedInterfacePluginIsDisabled'));
    if (id === 'nixel.ui.default') return this.loadInterface('');
    const { renderer } = entry.item.manifest;
    if (!renderer || !entry.item.directory)
      throw new Error(tr('plugins.thisPluginDoesNotProvideAnInterface'));
    await this.loadInterface(await entryPath(entry.item.directory, renderer));
  }

  private registerCommands() {
    const commands = {
      register: <P, R>(ctx: Context, name: string, handler: (input: P) => R | Promise<R>) =>
        this.host.commands.register(ctx, name, (input: P) =>
          name.startsWith('plugins.') || name === 'settings.update'
            ? this.serial(() =>
                name.startsWith('plugins.')
                  ? this.host.tasks.lifecycle(undefined, async () => handler(input))
                  : handler(input),
              )
            : handler(input),
        ),
    };
    commands.register(this.ctx, 'settings.update', async (input: unknown) => {
      const patch = await validateSettings(this.host, input);
      if (patch.interfacePlugin !== undefined) await this.selectInterface(patch.interfacePlugin);
      await this.host.store.update((state) => {
        Object.assign(state.settings, {
          ...patch,
          providers: { ...state.settings.providers, ...patch.providers },
        });
      });
    });
    commands.register(this.ctx, 'tasks.cancel', ({ id }: { id: string }) =>
      this.host.tasks.cancel(id),
    );
    commands.register(this.ctx, 'tasks.pause', ({ id }: { id: string }) =>
      this.host.tasks.pause(id),
    );
    commands.register(this.ctx, 'tasks.resume', ({ id }: { id: string }) =>
      this.host.tasks.resume(id),
    );
    commands.register(this.ctx, 'tasks.retry', async ({ id }: { id: string }) => ({
      taskId: await this.host.tasks.retry(id),
    }));
    commands.register(this.ctx, 'tasks.clear', () => this.host.tasks.clear());
    commands.register(
      this.ctx,
      'plugins.setEnabled',
      async ({ id, enabled }: { id: string; enabled: boolean }) => {
        if (typeof enabled !== 'boolean') throw new Error(tr('plugins.invalidEnabledState'));
        if (enabled) {
          const entry = this.require(id);
          this.assertIdle(entry);
          entry.item.enabled = true;
          await this.enable(id, new Set());
        } else await this.disable(id);
        await this.save();
      },
    );
    commands.register(
      this.ctx,
      'plugins.configure',
      async ({
        id,
        config,
        merge,
      }: {
        id: string;
        config: Record<string, unknown>;
        merge?: boolean;
      }) => {
        if (!config || typeof config !== 'object' || Array.isArray(config))
          throw new Error(tr('plugins.pluginConfigurationMustBeAnObject'));
        if (merge !== undefined && typeof merge !== 'boolean')
          throw new Error(tr('plugins.pluginConfigurationMustBeAnObject'));
        const entry = this.require(id);
        this.assertIdle(entry);
        if (merge) config = { ...entry.item.config, ...config };
        validateConfig(entry.item.manifest, config);
        const previous = entry.item.config;
        const wasRunning = Boolean(entry.fiber);
        entry.item.config = config;
        try {
          if (entry.fiber) {
            await entry.fiber.update(config);
            await entry.fiber.await();
            entry.item.status = 'active';
            delete entry.item.error;
          }
          await this.save();
        } catch (error) {
          entry.item.config = previous;
          if (wasRunning) {
            await entry.fiber?.dispose();
            entry.fiber = undefined;
            entry.item.status = 'disabled';
            await this.enable(id, new Set());
          }
          this.changed();
          if (wasRunning && this.require(id).item.status === 'error')
            throw new Error(
              tr('pluginDist.rollbackFailed', {
                error: String(error),
                rollback: entry.item.error ?? '',
              }),
            );
          throw error;
        }
        this.changed();
      },
    );
    commands.register(this.ctx, 'plugins.install', async ({ directory }: { directory: string }) => {
      if (!isAbsolute(directory)) throw new Error(tr('plugins.thePluginDirectoryMustBeAnAbsolute'));
      const root = await realpath(directory);
      const manifest = await readManifest(root);
      if (this.entries.has(manifest.id))
        throw new Error(tr('plugins.thisPluginIsAlreadyInstalled'));
      const item = this.item(manifest, false, root);
      this.assertIdle({ item });
      this.entries.set(manifest.id, { item });
      await this.enable(manifest.id, new Set());
      await this.save();
    });
    commands.register(this.ctx, 'plugins.remove', async ({ id }: { id: string }) => {
      const entry = this.require(id);
      if (entry.item.builtin) throw new Error(tr('plugins.builtInPluginsCanBeDisabledBut'));
      await this.disable(id);
      this.entries.delete(id);
      await this.save();
      this.changed();
      if (entry.item.managed) {
        await this.transactions.managed.remove(entry.item.managed.current.directory);
        if (entry.item.managed.previous)
          await this.transactions.managed.remove(entry.item.managed.previous.directory);
      }
    });
  }
}
