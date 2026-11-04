import { Card } from '@heroui/react';
import { useEffect, useState } from 'react';
import { label, tr } from '../../shared/i18n';
import type { Resource } from './data';
import { resourceSource } from './data';
import { useApp } from './state';
import { Action, Choice, Empty, Notice, Search } from './ui';
import { AssetIcon } from './workspace';

type CatalogState = {
  query: string;
  sort: string;
  offset: number;
  results: Resource[];
  total: number;
  loading: boolean;
  error: string;
  warnings: { source: string; message: string }[];
  hasMore: boolean;
};
const emptyCatalog: CatalogState = {
  query: '',
  sort: 'downloads',
  offset: 0,
  results: [],
  total: 0,
  loading: false,
  error: '',
  warnings: [],
  hasMore: false,
};

export function ResourceBrowser({
  category,
  instanceId,
}: {
  category: string;
  instanceId?: string;
}) {
  const a = useApp();
  const language = a.settings.locale;
  const [selectedSource, setSelectedSource] = useState('all');
  const [catalogs, setCatalogs] = useState<Record<string, CatalogState>>({});
  const instance = a.instances.find((i) => i.id === instanceId);
  const sources = a.providers.filter((provider) => provider.kind === 'resources');
  const sourceId = sources.some((source) => source.id === selectedSource) ? selectedSource : 'all';
  const sourceName =
    sources.find((p) => p.id === sourceId)?.name ?? tr('ResourceBrowser.allSources');
  const catalogKey = `${sourceId}:${category}:${instanceId ?? ''}`;
  const { query, sort, offset, results, total, loading, error, warnings, hasMore } =
    catalogs[catalogKey] ?? emptyCatalog;
  const update = (patch: Partial<CatalogState>) =>
    setCatalogs((previous) => ({
      ...previous,
      [catalogKey]: { ...(previous[catalogKey] ?? emptyCatalog), ...patch },
    }));
  const chooseSource = (id: string) => {
    const nextKey = `${id}:${category}:${instanceId ?? ''}`;
    setSelectedSource(id);
    setCatalogs((previous) => ({
      ...previous,
      [nextKey]: { ...(previous[nextKey] ?? emptyCatalog), offset: 0 },
    }));
  };
  const enabled =
    sources.length > 0 &&
    a.host.status === 'ready' &&
    (instanceId
      ? a.page === 'instances' &&
        a.instanceTab === 'content' &&
        a.current?.id === instanceId &&
        a.instanceCatalogOpen
      : a.page === 'resources');
  useEffect(() => {
    // Provider errors are translated by the Host, so refresh them after a language change.
    void language;
    if (!enabled) return;
    let active = true;
    setCatalogs((previous) => ({
      ...previous,
      [catalogKey]: {
        ...(previous[catalogKey] ?? emptyCatalog),
        loading: true,
        error: '',
        warnings: [],
      },
    }));
    const timer = setTimeout(async () => {
      try {
        const data = await a.searchResources({
          query,
          category,
          sort,
          offset,
          instanceId,
          source: sourceId,
        });
        if (active)
          setCatalogs((previous) => ({
            ...previous,
            [catalogKey]: {
              ...(previous[catalogKey] ?? emptyCatalog),
              results: data.results,
              total: data.total,
              warnings: data.warnings,
              hasMore: data.hasMore,
              loading: false,
              error: '',
            },
          }));
      } catch (reason) {
        if (active)
          setCatalogs((previous) => ({
            ...previous,
            [catalogKey]: {
              ...(previous[catalogKey] ?? emptyCatalog),
              loading: false,
              error: reason instanceof Error ? reason.message : String(reason),
            },
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
    enabled,
    sourceId,
    catalogKey,
    language,
  ]);
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
          onChange={(query) => update({ query, offset: 0 })}
          placeholder={tr('ResourceBrowser.searchValueValue', {
            value1: sourceName,
            value2: label(category),
          })}
        />
        <Choice
          label={tr('ResourceBrowser.resourceSource')}
          value={sourceId}
          onChange={chooseSource}
          options={[
            { id: 'all', name: tr('ResourceBrowser.allSources') },
            ...sources.map((provider) => ({ id: provider.id, name: provider.name })),
          ]}
        />
        <Choice
          label={tr('ResourceBrowser.sort')}
          value={sort}
          onChange={(sort) => update({ sort, offset: 0 })}
          options={[
            { id: 'downloads', name: tr('ResourceBrowser.downloads') },
            { id: 'relevance', name: tr('ResourceBrowser.relevance') },
            { id: 'updated', name: tr('ResourceBrowser.recentlyUpdated') },
          ]}
        />
      </div>
      <div className="workspace-scroll" aria-busy={loading}>
        {warnings.map((warning) => (
          <div className="catalog-warning" key={warning.source}>
            <Notice tone="warning">
              {warning.source}: {warning.message}
            </Notice>
          </div>
        ))}
        {error ? (
          <Notice tone="danger">{error}</Notice>
        ) : loading ? (
          <div className="catalog-loading">{tr('catalog.loading', { source: sourceName })}</div>
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
        ) : (
          <Empty
            title={
              sources.length
                ? tr('ResourceBrowser.noMatchingResources')
                : tr('ResourceBrowser.noResourceSourcesEnabled')
            }
            detail={
              sources.length
                ? tr('ResourceBrowser.tryDifferentKeywordsOrAnotherSource')
                : tr('ResourceBrowser.enableAResourcePluginOnThePlugins')
            }
            icon="search"
          />
        )}
        {(offset > 0 || hasMore) && !error && (
          <div className="row catalog-pagination">
            <Action
              size="sm"
              variant="secondary"
              isDisabled={loading || offset === 0}
              onPress={() => update({ offset: Math.max(0, offset - 20) })}
            >
              {tr('ResourceBrowser.previous')}
            </Action>
            <span>{tr('catalog.page', { page: Math.floor(offset / 20) + 1, total })}</span>
            <Action
              size="sm"
              variant="secondary"
              isDisabled={loading || !hasMore}
              onPress={() => update({ offset: offset + 20 })}
            >
              {tr('ResourceBrowser.next')}
            </Action>
          </div>
        )}
      </div>
    </div>
  );
}
