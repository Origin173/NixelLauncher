import type { Context } from 'cordis';
import type { NixelPluginManifest } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import type { PluginInstallPreview, PluginRollbackTarget } from '../../shared/plugin-distribution';
import { taskScope } from '../../shared/task-scope';
import type { NixelService } from '../core';
import { ManagedInstallation } from './managed';
import { dependencies, readManifest, validateConfig } from './manifest';
import type { InstalledPlugin } from './types';

export class PluginTransactions {
  readonly managed: ManagedInstallation;
  constructor(
    private host: NixelService,
    private entries: Map<string, InstalledPlugin>,
    private serial: <T>(action: () => T | Promise<T>) => Promise<T>,
    private item: (
      manifest: NixelPluginManifest,
      builtin: boolean,
      directory?: string,
    ) => InstalledPlugin['item'],
    private inspect: (manifest: NixelPluginManifest) => string[],
    private enable: (id: string, ancestors: Set<string>) => Promise<void>,
    private save: () => Promise<void>,
    private changed: () => void,
  ) {
    this.managed = new ManagedInstallation(host.store.root);
  }
  private require(id: string) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(tr('plugins.pluginIsNotInstalledValue', { value1: id }));
    return entry;
  }
  private managedTask(ctx: Context, id: string) {
    const execution = taskScope.getStore()?.task;
    if (!execution) throw new Error(tr('pluginDist.owner'));
    this.host.tasks.assertOwner(ctx, execution);
    const owner = [...this.entries.values()].find(
      (entry) =>
        entry.fiber?.uid === ctx.fiber.uid || ctx.fiber.parent.fiber.uid === entry.fiber?.uid,
    );
    if (!owner) throw new Error(tr('pluginDist.owner'));
    const blocked = new Set<string>();
    const visit = (pluginId: string) => {
      if (blocked.has(pluginId)) return;
      blocked.add(pluginId);
      const plugin = this.entries.get(pluginId);
      if (plugin)
        for (const dependency of Object.keys(dependencies(plugin.item.manifest))) visit(dependency);
    };
    visit(owner.item.id);
    if (blocked.has(id)) throw new Error(tr('pluginDist.owner'));
    if (
      this.host.running.size ||
      this.host.tasks
        .list()
        .some((task) => task.status === 'running' && task.id !== execution.taskId)
    )
      throw new Error(tr('plugins.stopGamesAndCancelActiveTasksBefore'));
    if (this.host.store.read().settings.interfacePlugin === id)
      throw new Error(tr('plugins.switchToAnotherInterfaceFirst'));
    return execution;
  }

  installManaged(ctx: Context, directory: string, preview: PluginInstallPreview) {
    return this.serial(async () => {
      const id = preview.package.manifest.id;
      const execution = this.managedTask(ctx, id);
      const old = this.entries.get(id);
      if (old?.item.version !== preview.installedVersion) throw new Error(tr('pluginDist.changed'));
      const problems = this.inspect(preview.package.manifest);
      if (problems.length) throw new Error(problems.join('\n'));
      if (!preview.config || typeof preview.config !== 'object' || Array.isArray(preview.config))
        throw new Error(tr('plugins.pluginConfigurationMustBeAnObject'));
      validateConfig(preview.package.manifest, preview.config);
      const release = await this.managed.stage(directory, preview);
      const next: InstalledPlugin = {
        item: this.item(preview.package.manifest, false, release.directory),
      };
      next.item.config = preview.config;
      next.item.managed = {
        current: release,
        previous: old?.item.managed
          ? { ...old.item.managed.current, config: old.item.config }
          : undefined,
      };
      try {
        execution.signal.throwIfAborted();
        await this.host.tasks.lifecycle(execution.taskId, async () => {
          this.managedTask(ctx, id);
          await this.replace(id, next, old, execution.signal);
        });
      } catch (error) {
        try {
          await this.managed.remove(release.directory);
        } catch (cleanupError) {
          execution.log(String(cleanupError));
        }
        throw error;
      }
      if (old?.item.managed?.previous) {
        try {
          await this.managed.remove(old.item.managed.previous.directory);
        } catch (error) {
          execution.log(String(error));
        }
      }
    });
  }

  rollback(ctx: Context, target: PluginRollbackTarget) {
    return this.serial(async () => {
      const { id } = target;
      const execution = this.managedTask(ctx, id);
      const old = this.require(id);
      const managed = old.item.managed;
      const previous = managed?.previous;
      if (!managed || !previous) throw new Error(tr('pluginDist.noRollback'));
      if (managed.current.directory !== target.current || previous.directory !== target.previous)
        throw new Error(tr('pluginDist.changed'));
      await this.managed.verify(previous.directory);
      const manifest = await readManifest(previous.directory);
      const problems = this.inspect(manifest);
      if (problems.length) throw new Error(problems.join('\n'));
      validateConfig(manifest, previous.config);
      const next: InstalledPlugin = { item: this.item(manifest, false, previous.directory) };
      next.item.config = previous.config;
      next.item.managed = {
        current: previous,
        previous: { ...managed.current, config: old.item.config },
      };
      await this.host.tasks.lifecycle(execution.taskId, async () => {
        this.managedTask(ctx, id);
        await this.replace(id, next, old, execution.signal);
      });
    });
  }

  private async replace(
    id: string,
    next: InstalledPlugin,
    old: InstalledPlugin | undefined,
    signal: AbortSignal,
  ) {
    try {
      await old?.fiber?.dispose();
      if (old) old.fiber = undefined;
      this.entries.set(id, next);
      if (next.item.enabled) {
        await this.enable(id, new Set());
        if (next.item.status !== 'active') throw new Error(next.item.error);
      }
      signal.throwIfAborted();
      await this.save();
      this.changed();
    } catch (error) {
      await next.fiber?.dispose();
      if (old) {
        this.entries.set(id, old);
        old.item.status = 'disabled';
        if (old.item.enabled) await this.enable(id, new Set());
      } else this.entries.delete(id);
      await this.save();
      this.changed();
      if (old?.item.status === 'error')
        throw new Error(
          tr('pluginDist.rollbackFailed', { error: String(error), rollback: old.item.error ?? '' }),
        );
      throw error;
    }
  }
}
