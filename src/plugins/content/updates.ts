import type { Context } from 'cordis';
import type { ContentUpdateTarget } from '../../shared/contracts';
import { errorMessage } from '../../shared/error-message';
import { tr } from '../../shared/i18n';
import { commandsFor } from '../commands';
import { assertInstanceIdle, getInstance } from '../instance-state';
import type { ResourceProvider } from '../providers';
import { installContentFile, normalizeResourceSource, scanContent } from '../resource-files';
import { planContentUpdates } from './update-plan';

export function registerContentUpdates(ctx: Context) {
  const host = ctx.nixel;
  const command = commandsFor(ctx);

  command('content.checkUpdates', ({ instanceId }: { instanceId: string }) => {
    getInstance(host, instanceId);
    assertInstanceIdle(host, instanceId);
    return {
      taskId: host.tasks.start(
        tr('Instances.checkForUpdates'),
        tr('content.preparingCheck'),
        async (task) => {
          const instance = getInstance(host, instanceId);
          assertInstanceIdle(host, instanceId, task.taskId);
          const entries = await scanContent(host, instance);
          await host.store.update((draft) => {
            for (const entry of draft.content)
              if (entry.instance === instanceId) delete entry.update;
          });
          const registered = host.providers
            .list()
            .filter((provider) => provider.kind === 'resources');
          const sources = [
            ...new Set([
              ...registered.map((provider) => provider.id),
              ...entries.flatMap((entry) => {
                const source = normalizeResourceSource(entry.source);
                return source ? [source] : [];
              }),
            ]),
          ];
          if (entries.length && !sources.length) throw new Error(tr('content.noProviders'));
          const errors: Error[] = [];
          for (const [index, source] of sources.entries()) {
            task.signal.throwIfAborted();
            const name = registered.find((provider) => provider.id === source)?.name ?? source;
            task.report((index / sources.length) * 100, tr('content.checkingSource', { name }));
            try {
              await host.providers
                .get<ResourceProvider>('resources', source)
                .checkUpdates(instance, {
                  ...task,
                  report: (progress, detail) =>
                    task.report(((index + progress / 100) / sources.length) * 100, detail),
                });
            } catch (error) {
              task.signal.throwIfAborted();
              const failure = new Error(
                tr('content.sourceCheckFailed', { name, message: errorMessage(error) }),
              );
              errors.push(failure);
              task.log(failure.message);
            }
          }
          const count = host.store
            .read()
            .content.filter((entry) => entry.instance === instanceId && entry.update).length;
          const summary = tr('content.updatesFound', { count });
          task.report(100, summary);
          task.log(summary);
          if (errors.length) throw new AggregateError(errors, tr('content.checkIncomplete'));
        },
        {
          instanceId,
          kind: 'content-check',
          retry: { command: 'content.checkUpdates', params: { instanceId } },
        },
      ),
    };
  });

  const findTarget = (instanceId: string, target: ContentUpdateTarget) => {
    const entry = host.store
      .read()
      .content.find(
        (entry) =>
          entry.instance === instanceId &&
          normalizeResourceSource(entry.source) === target.source &&
          entry.projectId === target.projectId,
      );
    if (!entry) throw new Error(tr('content.updateTargetChanged'));
    return entry;
  };

  command(
    'content.update',
    ({ instanceId, updates }: { instanceId: string; updates: ContentUpdateTarget[] }) => {
      getInstance(host, instanceId);
      assertInstanceIdle(host, instanceId);
      if (
        !Array.isArray(updates) ||
        !updates.length ||
        updates.some(
          (target) =>
            !target ||
            ['source', 'projectId', 'versionId'].some(
              (key) =>
                typeof target[key as keyof ContentUpdateTarget] !== 'string' ||
                !target[key as keyof ContentUpdateTarget],
            ),
        ) ||
        new Set(updates.map((target) => `${target.source}:${target.projectId}`)).size !==
          updates.length
      )
        throw new Error(tr('content.chooseUpdates'));
      for (const target of updates) findTarget(instanceId, target);
      return {
        taskId: host.tasks.start(
          tr('content.updateTask', { count: updates.length }),
          tr('resources.resolvingResourcesAndDependencies'),
          async (task) => {
            const instance = getInstance(host, instanceId);
            assertInstanceIdle(host, instanceId, task.taskId);
            const installed = await scanContent(host, instance);
            const files = await planContentUpdates(host, instance, updates, installed, task.signal);
            for (const [index, file] of files.entries()) {
              task.signal.throwIfAborted();
              const entry = host.store
                .read()
                .content.find(
                  (entry) =>
                    entry.instance === instanceId &&
                    normalizeResourceSource(entry.source) === file.source &&
                    entry.projectId === file.projectId,
                );
              const detail = tr('content.updatingFile', {
                name: file.name,
                current: index + 1,
                total: files.length,
              });
              task.report((index / files.length) * 100, detail);
              if (
                entry?.versionId === file.versionId &&
                entry.category === file.category &&
                entry.fileName.replace(/\.disabled$/, '') === file.fileName
              ) {
                task.log(tr('content.alreadyUpdated', { name: entry.name }));
                continue;
              }
              await installContentFile(
                host,
                instance,
                {
                  ...task,
                  report: (progress) =>
                    task.report(((index + progress / 100) / files.length) * 100, detail),
                },
                file,
              );
              task.log(tr('content.updatedFile', { name: file.name }));
            }
            for (const file of files) {
              const entry = findTarget(instanceId, file);
              if (entry.versionId !== file.versionId)
                throw new Error(tr('content.updateVersionConflict', { name: entry.name }));
            }
            task.report(100, tr('content.updatedCount', { count: updates.length }));
          },
          {
            instanceId,
            kind: 'content-update',
            retry: { command: 'content.update', params: { instanceId, updates } },
          },
        ),
      };
    },
  );
}
