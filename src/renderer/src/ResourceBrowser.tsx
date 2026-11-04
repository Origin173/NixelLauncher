import { Card } from '@heroui/react';
import { useEffect, useState } from 'react';
import type { LauncherSettings, ResourceQuery, ResourceSearchResult } from '../../shared/contracts';
import { errorMessage } from '../../shared/error-message';
import { label, tr } from '../../shared/i18n';
import { resourceSource } from './data';
import { useApp } from './state';
import { Action, Choice, Empty, Notice, Search } from './ui';
import { AssetIcon } from './workspace';

type CatalogFilters = {
  query: string;
  sort: string;
};
const defaultFilters: CatalogFilters = { query: '', sort: 'downloads' };
type CatalogPage = {
  offset: number;
  attempt: number;
  locale: LauncherSettings['locale'];
  data?: ResourceSearchResult;
  error?: string;
};

export function ResourceBrowser({
  category,
  instanceId,
}: {
  category: string;
  instanceId?: string;
}) {
  const a = useApp();
  const [source, setSource] = useState({ id: 'all', name: '' });
  const [filters, setFilters] = useState<Record<string, CatalogFilters>>({});
  const instance = a.instances.find((i) => i.id === instanceId);
  const sources = a.providers.filter((provider) => provider.kind === 'resources');
  const selected = sources.find((provider) => provider.id === source.id);
  const sourceAvailable = source.id === 'all' || Boolean(selected);
  const sourceName =
    source.id === 'all' ? tr('ResourceBrowser.allSources') : (selected?.name ?? source.name);
  const filterKey = JSON.stringify([source.id, category, instanceId]);
  const { query, sort } = filters[filterKey] ?? defaultFilters;
  const update = (patch: Partial<CatalogFilters>) =>
    setFilters((previous) => ({
      ...previous,
      [filterKey]: { ...(previous[filterKey] ?? defaultFilters), ...patch },
    }));
  const resultsKey = JSON.stringify([
    filterKey,
    query,
    sort,
    instance?.version,
    instance?.loader,
    instance?.loaderVersion,
    sources.map(({ id }) => id).sort(),
    a.host.pid,
  ]);
  const enabled =
    sources.length > 0 &&
    sourceAvailable &&
    a.host.status === 'ready' &&
    (instanceId
      ? a.page === 'instances' &&
        a.instanceTab === 'content' &&
        a.current?.id === instanceId &&
        a.instanceCatalogOpen
      : a.page === 'resources');
  return (
    <div className="resource-browser">
      {instance && (
        <div className="context-pill">
          {tr('overlays.installTo')}
          <strong>{instance.name}</strong> · {instance.version} · {instance.loader}
        </div>
      )}
      <div className="content-toolbar">
        <Search
          value={query}
          onChange={(query) => update({ query })}
          placeholder={tr('ResourceBrowser.searchValueValue', {
            value1: sourceName,
            value2: label(category),
          })}
        />
        <Choice
          label={tr('ResourceBrowser.resourceSource')}
          value={source.id}
          onChange={(id) =>
            setSource({ id, name: sources.find((entry) => entry.id === id)?.name ?? '' })
          }
          options={[
            { id: 'all', name: tr('ResourceBrowser.allSources') },
            ...sources.map((provider) => ({ id: provider.id, name: provider.name })),
            ...(!sourceAvailable ? [source] : []),
          ]}
        />
        <Choice
          label={tr('ResourceBrowser.sort')}
          value={sort}
          onChange={(sort) => update({ sort })}
          options={[
            { id: 'downloads', name: tr('ResourceBrowser.downloads') },
            { id: 'relevance', name: tr('ResourceBrowser.relevance') },
            { id: 'updated', name: tr('ResourceBrowser.recentlyUpdated') },
          ]}
        />
      </div>
      <ResourceResults
        key={resultsKey}
        search={{ query, category, sort, instanceId, source: source.id }}
        enabled={enabled}
        sourceAvailable={sourceAvailable}
        sourceName={sourceName}
      />
    </div>
  );
}

function ResourceResults({
  search: { query, category, sort, instanceId, source },
  enabled,
  sourceAvailable,
  sourceName,
}: {
  search: ResourceQuery;
  enabled: boolean;
  sourceAvailable: boolean;
  sourceName: string;
}) {
  const a = useApp();
  const locale = a.settings.locale;
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<CatalogPage>();
  const current = page?.offset === offset ? page : undefined;
  const { data, error } = current ?? {};
  const warnings = data?.warnings ?? [];
  const results = data?.items ?? [];
  const loading = enabled && (!current || current.attempt !== attempt || current.locale !== locale);
  const hasSources = a.providers.some((provider) => provider.kind === 'resources');
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const data = await a.searchResources({ query, category, sort, offset, instanceId, source });
        if (active) setPage({ offset, attempt, locale, data });
      } catch (reason) {
        if (active)
          setPage((previous) => ({
            offset,
            attempt,
            locale,
            data: previous?.offset === offset ? previous.data : undefined,
            error: errorMessage(reason),
          }));
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    a.searchResources,
    query,
    category,
    sort,
    offset,
    instanceId,
    source,
    enabled,
    attempt,
    locale,
  ]);
  return (
    <div className="workspace-scroll" aria-busy={loading}>
      {warnings.map((warning) => (
        <div className="catalog-warning" key={warning.source}>
          <Notice tone="warning">
            {warning.source}: {warning.message}
          </Notice>
        </div>
      ))}
      {(error || warnings.length > 0) && (
        <div className="stack catalog-warning">
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="row">
            <Action
              size="sm"
              variant="secondary"
              icon="refresh"
              isDisabled={!enabled || loading}
              isPending={loading}
              onPress={() => setAttempt((value) => value + 1)}
            >
              {tr('ResourceBrowser.retryPage')}
            </Action>
          </div>
        </div>
      )}
      {!sourceAvailable ? (
        <Notice tone="warning">
          {tr('ResourceBrowser.sourceUnavailable', { name: sourceName })}
        </Notice>
      ) : results.length ? (
        <Card className="resource-list panel-enter">
          {results.map((r) => {
            const origin = resourceSource(r.source);
            const providerLabel =
              a.providers.find(
                (provider) => provider.kind === 'resources' && provider.id === origin,
              )?.name ?? r.source;
            const task = a.tasks.find(
              (task) =>
                task.resourceId === r.id &&
                resourceSource(task.resourceSource) === origin &&
                (!instanceId || task.instanceId === instanceId) &&
                task.status === 'running',
            );
            const installed = a.content.find(
              (content) =>
                content.instance === instanceId &&
                (content.projectId ?? content.id) === r.id &&
                resourceSource(content.source) === origin,
            );
            const open = () => a.setOverlay({ type: 'resource', resource: r, instanceId });
            return (
              <article className="resource-row" key={`${origin}:${r.id}`}>
                <button type="button" className="list-row-main" onClick={open}>
                  <AssetIcon src={r.icon} kind={r.category} />
                  <span className="resource-info">
                    <span className="row">
                      <strong>{r.name}</strong>
                      <span className="resource-author">{r.author}</span>
                    </span>
                    <span className="list-description">{r.desc}</span>
                    <span className="resource-meta">
                      {tr('catalog.downloadCount', { count: r.downloads })} · {providerLabel}
                    </span>
                  </span>
                </button>
                <Action
                  variant="ghost"
                  size="sm"
                  isDisabled={Boolean(task)}
                  icon={installed ? 'check' : 'plus'}
                  onPress={() =>
                    a.setOverlay({ type: 'resource', resource: r, instanceId, tab: 'versions' })
                  }
                >
                  {task
                    ? `${Math.round(task.progress)}%`
                    : installed
                      ? label('installed')
                      : tr('ResourceBrowser.install')}
                </Action>
              </article>
            );
          })}
        </Card>
      ) : loading ? (
        <div className="catalog-loading">{tr('catalog.loading', { source: sourceName })}</div>
      ) : !error && warnings.length === 0 ? (
        <Empty
          title={
            hasSources
              ? tr('ResourceBrowser.noMatchingResources')
              : tr('ResourceBrowser.noResourceSourcesEnabled')
          }
          detail={
            hasSources
              ? tr('ResourceBrowser.tryDifferentKeywordsOrAnotherSource')
              : tr('ResourceBrowser.enableAResourcePluginOnThePlugins')
          }
          icon="search"
        />
      ) : null}
      {(offset > 0 || data?.hasMore) && !error && (
        <div className="row catalog-pagination">
          <Action
            size="sm"
            variant="secondary"
            isDisabled={loading || offset === 0}
            onPress={() => setOffset(Math.max(0, offset - 20))}
          >
            {tr('ResourceBrowser.previous')}
          </Action>
          <span>
            {tr('catalog.page', { page: Math.floor(offset / 20) + 1, total: data?.total ?? 0 })}
          </span>
          <Action
            size="sm"
            variant="secondary"
            isDisabled={loading || !data?.hasMore}
            onPress={() => setOffset(offset + 20)}
          >
            {tr('ResourceBrowser.next')}
          </Action>
        </div>
      )}
    </div>
  );
}
