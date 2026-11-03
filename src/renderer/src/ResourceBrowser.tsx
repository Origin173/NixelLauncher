import { Card } from '@heroui/react';
import { useEffect, useState } from 'react';
import type { Resource } from './data';
import { resourceSource } from './data';
import { useApp } from './state';
import { Action, Choice, Empty, Notice, Search } from './ui';
import { PlaceholderIcon } from './workspace';

type CatalogState = {
  query: string;
  sort: string;
  offset: number;
  results: Resource[];
  total: number;
  loading: boolean;
  error: string;
};
const emptyCatalog: CatalogState = {
  query: '',
  sort: 'downloads',
  offset: 0,
  results: [],
  total: 0,
  loading: false,
  error: '',
};

export function ResourceBrowser({
  category,
  instanceId,
}: {
  category: string;
  instanceId?: string;
}) {
  const a = useApp();
  const [selectedSource, setSelectedSource] = useState('');
  const [catalogs, setCatalogs] = useState<Record<string, CatalogState>>({});
  const instance = a.instances.find((i) => i.id === instanceId);
  const sources = a.providers.filter((provider) => provider.kind === 'resources');
  const preferred = instance?.providers.resources ?? a.settings.providers.resources;
  const source =
    sources.find((provider) => provider.id === selectedSource) ??
    sources.find((provider) => provider.id === preferred) ??
    sources[0];
  const sourceId = source?.id ?? '';
  const sourceName = source?.name ?? '资源目录';
  const catalogKey = `${sourceId}:${category}:${instanceId ?? ''}`;
  const { query, sort, offset, results, total, loading, error } =
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
    Boolean(sourceId) &&
    a.host.status === 'ready' &&
    (instanceId
      ? a.page === 'instances' &&
        a.instanceTab === '内容' &&
        a.current?.id === instanceId &&
        a.instanceCatalogOpen
      : a.page === 'resources');
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setCatalogs((previous) => ({
      ...previous,
      [catalogKey]: { ...(previous[catalogKey] ?? emptyCatalog), loading: true, error: '' },
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
  }, [a.searchResources, query, category, sort, offset, instanceId, enabled, sourceId, catalogKey]);
  return (
    <div className="resource-browser">
      {instance && (
        <div className="context-pill">
          安装到 <strong>{instance.name}</strong> · {instance.version} · {instance.loader}
        </div>
      )}
      <div className="content-toolbar">
        <Search
          value={query}
          onChange={(query) => update({ query, offset: 0 })}
          placeholder={`搜索 ${sourceName} ${category}`}
        />
        <Choice
          label="资源来源"
          value={sourceId}
          onChange={chooseSource}
          options={sources.map((provider) => ({ id: provider.id, name: provider.name }))}
        />
        <Choice
          label="排序"
          value={sort}
          onChange={(sort) => update({ sort, offset: 0 })}
          options={[
            { id: 'downloads', name: '下载量' },
            { id: 'relevance', name: '相关度' },
            { id: 'updated', name: '最近更新' },
          ]}
        />
      </div>
      <div className="workspace-scroll" aria-busy={loading}>
        {error ? (
          <Notice tone="danger">{error}</Notice>
        ) : loading ? (
          <div className="catalog-loading">正在读取 {sourceName}…</div>
        ) : results.length ? (
          <Card className="resource-list panel-enter">
            {results.map((r) => {
              const origin = resourceSource(r.source);
              const label =
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
                    <PlaceholderIcon name={r.name} />
                    <span className="resource-info">
                      <span className="row">
                        <strong>{r.name}</strong>
                        <span className="resource-author">{r.author}</span>
                      </span>
                      <span className="list-description">{r.desc}</span>
                      <span className="resource-meta">
                        {r.downloads} 次下载 · {label}
                      </span>
                    </span>
                  </button>
                  <Action
                    variant="ghost"
                    size="sm"
                    isDisabled={Boolean(task)}
                    icon={installed ? 'check' : 'plus'}
                    onPress={open}
                  >
                    {task ? `${Math.round(task.progress)}%` : installed ? '已安装' : '安装'}
                  </Action>
                </article>
              );
            })}
          </Card>
        ) : (
          <Empty
            title={sources.length ? '没有匹配的资源' : '没有启用的资源来源'}
            detail={sources.length ? '试试其他关键词，或更换来源。' : '在插件页面启用资源插件。'}
            icon="search"
          />
        )}
        {total > 20 && !error && (
          <div className="row catalog-pagination">
            <Action
              size="sm"
              variant="secondary"
              isDisabled={loading || offset === 0}
              onPress={() => update({ offset: Math.max(0, offset - 20) })}
            >
              上一页
            </Action>
            <span>
              {offset + 1}–{Math.min(offset + 20, total)} / {total}
            </span>
            <Action
              size="sm"
              variant="secondary"
              isDisabled={loading || offset + 20 >= total}
              onPress={() => update({ offset: offset + 20 })}
            >
              下一页
            </Action>
          </div>
        )}
      </div>
    </div>
  );
}
