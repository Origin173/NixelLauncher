import { Card } from '@heroui/react';
import { useState } from 'react';
import { useApp } from '../state';
import { Action, Empty, Heading, Notice, Search, Tag, Toggle } from '../ui';
import { PlaceholderIcon, Workspace } from '../workspace';

export function PluginsPage() {
  const a = useApp();
  const [query, setQuery] = useState('');
  const list = a.plugins.filter((p) =>
    `${p.name} ${p.desc}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Workspace title="插件">
      <Heading title="插件" sub="业务服务全局启用。当前界面插件需要先切换其他界面后再停用。">
        <Action
          variant="secondary"
          icon="folder"
          size="sm"
          onPress={() => a.setOverlay({ type: 'local-plugin' })}
        >
          安装本地目录
        </Action>
      </Heading>
      <div className="content-toolbar">
        <Search value={query} onChange={setQuery} placeholder="搜索已安装插件" />
      </div>
      <div className="workspace-scroll">
        {list.length ? (
          <Card className="plugin-list">
            {list.map((p) => (
              <div className="plugin-row" key={p.id}>
                <button
                  type="button"
                  className="list-row-main"
                  onClick={() => a.setOverlay({ type: 'plugin', pluginId: p.id })}
                >
                  <PlaceholderIcon name={p.name} />
                  <span className="plugin-info">
                    <span className="row">
                      <strong>{p.name}</strong>
                      {p.official && <Tag>内置</Tag>}
                    </span>
                    <span className="list-description">{p.desc}</span>
                  </span>
                </button>
                <div className="plugin-meta">
                  <span>{p.category}</span>
                  <span className="micro">v{p.version}</span>
                  {p.error && <span className="field-error">{p.error}</span>}
                </div>
                <Toggle
                  label={`启用 ${p.name}`}
                  value={p.enabled}
                  disabled={p.id === a.settings.interfacePlugin}
                  onChange={(enabled) =>
                    void a.command('plugins.setEnabled', { id: p.id, enabled })
                  }
                />
              </div>
            ))}
          </Card>
        ) : (
          <Empty title="没有匹配的插件" icon="plugin" />
        )}
        <div className="padded">
          <Notice>本地插件会在独立 Host 中执行代码，请仅安装你信任的插件目录。</Notice>
        </div>
      </div>
    </Workspace>
  );
}
