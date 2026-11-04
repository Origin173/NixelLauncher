import type { Context } from 'cordis';
import type {
  ResourceInstallOptions,
  ResourceQuery,
  ResourceSearchResult,
} from '../../shared/contracts';
import type { TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import { commandsFor } from '../commands';
import { assertInstanceIdle, getInstance } from '../instance-state';
import type { ResourceProvider } from '../providers';
import { normalizeResourceSource } from '../resource-files';
export function registerCatalog(ctx: Context) {
  const host = ctx.nixel;
  const command = commandsFor(ctx);
  const selected = (instanceId?: string, source?: string) => {
    const instance = instanceId ? getInstance(host, instanceId) : undefined;
    const id =
      normalizeResourceSource(source) ||
      instance?.providers.resources ||
      host.store.read().settings.providers.resources;
    return { id, instance, provider: host.providers.get<ResourceProvider>('resources', id) };
  };
  command(
    'resources.details',
    ({ projectId, source }: { projectId: string; source: string }) =>
      selected(undefined, source).provider.details?.(projectId) ?? null,
  );
  command(
    'resources.versionDetails',
    ({ projectId, versionId, source }: { projectId: string; versionId: string; source: string }) =>
      selected(undefined, source).provider.versionDetails?.(projectId, versionId) ?? null,
  );
  command('resources.search', async (query: ResourceQuery): Promise<ResourceSearchResult> => {
    const instance = query.instanceId ? getInstance(host, query.instanceId) : undefined;
    const source = normalizeResourceSource(query.source);
    const sources = host.providers
      .list()
      .filter(
        (provider) =>
          provider.kind === 'resources' && (!source || source === 'all' || provider.id === source),
      );
    const responses = await Promise.allSettled(
      sources.map((source) =>
        host.providers.get<ResourceProvider>('resources', source.id).search(query, instance),
      ),
    );
    const pages: ResourceSearchResult['items'][] = [];
    const warnings: ResourceSearchResult['warnings'] = [];
    let total = 0;
    let hasMore = false;
    responses.forEach((response, index) => {
      const source = sources[index];
      if (!source) return;
      if (response.status === 'rejected') {
        warnings.push({
          source: source.name,
          message:
            response.reason instanceof Error ? response.reason.message : String(response.reason),
        });
        return;
      }
      pages.push(response.value.items.map((item) => ({ ...item, source: source.id })));
      total += response.value.total;
      hasMore ||= response.value.hasMore ?? (query.offset ?? 0) + 20 < response.value.total;
    });
    const items = Array.from({ length: 20 }, (_, index) =>
      pages.flatMap((page) => (page[index] ? [page[index]] : [])),
    ).flat();
    return { items, total, hasMore, warnings };
  });
  command(
    'resources.versions',
    ({
      projectId,
      instanceId,
      source,
    }: {
      projectId: string;
      instanceId?: string;
      source?: string;
    }) => {
      const selection = selected(instanceId, source);
      return selection.provider.versions(projectId, selection.instance);
    },
  );
  command(
    'resources.optionalDependencies',
    ({
      projectId,
      versionId,
      instanceId,
      source,
    }: {
      projectId: string;
      versionId: string;
      instanceId: string;
      source: string;
    }) => {
      const selection = selected(instanceId, source);
      if (!selection.instance) throw new Error(tr('curseforge.chooseATargetInstanceFirst'));
      return (
        selection.provider.optionalDependencies?.(projectId, versionId, selection.instance) ?? null
      );
    },
  );
  command(
    'resources.install',
    ({
      projectId,
      versionId,
      instanceId,
      source,
      optionalDependencies,
    }: {
      projectId: string;
      versionId: string;
      instanceId?: string;
      source?: string;
    } & ResourceInstallOptions) => {
      const selection = selected(instanceId, source);
      const instance = selection.instance;
      if (
        optionalDependencies !== undefined &&
        (!Array.isArray(optionalDependencies) ||
          optionalDependencies.some(
            (entry) =>
              !entry ||
              typeof entry.projectId !== 'string' ||
              !entry.projectId ||
              typeof entry.versionId !== 'string' ||
              !entry.versionId,
          ))
      )
        throw new Error(tr('optionalDependencies.selectionChanged'));
      if (optionalDependencies?.length && !selection.provider.optionalDependencies)
        throw new Error(tr('optionalDependencies.unsupported'));
      if (instance) assertInstanceIdle(host, instance.id);
      return {
        taskId: host.tasks.start(
          tr('resources.installResource'),
          tr('resources.resolvingResourcesAndDependencies'),
          async (task: TaskContext) => {
            const current = selected(instanceId, selection.id);
            if (current.instance) assertInstanceIdle(host, current.instance.id, task.taskId);
            await current.provider.install(projectId, versionId, current.instance, task, {
              optionalDependencies,
            });
          },
          {
            instanceId: instance?.id,
            resourceId: projectId,
            resourceSource: selection.id,
            kind: 'resource',
            retry: {
              command: 'resources.install',
              params: {
                projectId,
                versionId,
                instanceId,
                source: selection.id,
                optionalDependencies,
              },
            },
          },
        ),
      };
    },
  );
}
