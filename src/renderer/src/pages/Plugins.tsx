import { Card } from '@heroui/react';
import { useState } from 'react';
import { tr } from '../../../shared/i18n';
import { useApp } from '../state';
import { Action, Empty, Heading, Notice, Search, Tag, Toggle } from '../ui';
import { AssetIcon, Workspace } from '../workspace';

export function PluginsPage() {
  const a = useApp();
  const [query, setQuery] = useState('');
  const list = a.plugins.filter((p) =>
    `${p.name} ${p.desc}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Workspace title={tr('App.plugins')}>
      <Heading
        title={tr('App.plugins')}
        sub={tr('Plugins.servicesAreEnabledGloballySwitchToAnother')}
      >
        <Action
          variant="secondary"
          icon="folder"
          size="sm"
          onPress={() => a.setOverlay({ type: 'local-plugin' })}
        >
          {tr('Plugins.installLocalDirectory')}
        </Action>
      </Heading>
      <div className="content-toolbar">
        <Search
          value={query}
          onChange={setQuery}
          placeholder={tr('Plugins.searchInstalledPlugins')}
        />
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
                  <AssetIcon kind="plugin" builtin={p.builtin} />
                  <span className="plugin-info">
                    <span className="row">
                      <strong>{p.name}</strong>
                      {p.official && <Tag>{tr('Plugins.builtIn')}</Tag>}
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
                  label={tr('overlays.enableValue', { value1: p.name })}
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
          <Empty title={tr('Plugins.noMatchingPlugins')} icon="plugin" />
        )}
        <div className="padded">
          <Notice>{tr('Plugins.localPluginsExecuteCodeInTheHost')}</Notice>
        </div>
      </div>
    </Workspace>
  );
}
