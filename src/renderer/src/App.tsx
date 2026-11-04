import { Tabs, Toast } from '@heroui/react';
import { useEffect } from 'react';
import { tr } from '../../shared/i18n';
import type { Page } from './data';
import type { IconName } from './icons';
import { Brand, Icon } from './icons';
import { Landscape } from './Landscape';
import { Overlays, TaskDrawer } from './overlays';
import { AccountsPage } from './pages/Accounts';
import { Home } from './pages/Home';
import { InstancesPage } from './pages/Instances';
import { PluginsPage } from './pages/Plugins';
import { ResourcesPage } from './pages/Resources';
import { SettingsPage } from './pages/Settings';
import { ApplicationLogsAction } from './settings/ApplicationLogsAction';
import { AppProvider, useApp } from './state';
import { Action, IconButton, Tag, Tile } from './ui';

const navigation = (): { id: Page; name: string; icon: IconName }[] => [
  { id: 'home', name: tr('App.home'), icon: 'home' },
  { id: 'instances', name: tr('App.instances'), icon: 'box' },
  { id: 'resources', name: tr('App.resources'), icon: 'compass' },
  { id: 'plugins', name: tr('App.plugins'), icon: 'plugin' },
  { id: 'accounts', name: tr('App.accounts'), icon: 'user' },
  { id: 'settings', name: tr('App.settings'), icon: 'settings' },
];
const views = {
  home: Home,
  instances: InstancesPage,
  resources: ResourcesPage,
  plugins: PluginsPage,
  accounts: AccountsPage,
  settings: SettingsPage,
};
function Wallpaper() {
  const a = useApp();
  if (a.background === 'none') return null;
  return (
    <div className="app-wallpaper" aria-hidden="true">
      {a.background.startsWith('data:') ? (
        <img className="custom-background" src={a.background} alt="" />
      ) : (
        <Landscape variant={a.background} />
      )}
      <div className="scene-shade" style={{ opacity: a.dim / 100 }} />
    </div>
  );
}
function Shell() {
  const a = useApp();
  const home = a.page === 'home' && !a.hostError;
  const count = a.tasks.filter((t) => t.status === 'running').length;
  useEffect(() => {
    const fn = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        a.setOverlay({ type: 'search' });
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [a.setOverlay]);
  return (
    <div className={`app-shell ${home ? 'shell-home' : ''}`}>
      <Wallpaper />
      <header className="topbar">
        <button
          type="button"
          className="brand"
          onClick={() => a.setPage('home')}
          aria-label={tr('App.nixelHome')}
        >
          <Brand size={24} />
          <span>
            Nixel<span className="brand-suffix">Launcher</span>
          </span>
        </button>
        <nav className="main-nav" aria-label={tr('App.mainNavigation')}>
          <Tabs
            variant="secondary"
            selectedKey={a.page}
            onSelectionChange={(key) => {
              a.setPage(String(key) as Page);
            }}
          >
            <Tabs.ListContainer className="titlebar-tabs">
              <Tabs.List aria-label={tr('App.mainNavigation')}>
                {navigation().map((n) => (
                  <Tabs.Tab
                    key={n.id}
                    id={n.id}
                    aria-label={n.name}
                    className="gap-2 whitespace-nowrap"
                  >
                    <Icon name={n.icon} size={16} />
                    <span>{n.name}</span>
                    <Tabs.Indicator className="titlebar-tab-indicator" />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </nav>
        <div className="header-actions">
          <IconButton
            icon="search"
            label={tr('App.searchCtrlK')}
            onPress={() => a.setOverlay({ type: 'search' })}
          />
          <div className="task-trigger">
            <IconButton
              icon="download"
              label={tr('App.openTaskCenter')}
              onPress={() => a.setTaskOpen(true)}
            />
            {count > 0 && <span className="count-badge">{count}</span>}
          </div>
          <span className="toolbar-divider" />
          <fieldset className="window-controls" aria-label={tr('App.windowControls')}>
            <IconButton
              className="window-control"
              icon="minimize"
              label={tr('App.minimizeWindow')}
              onPress={() => void window.nixel.windowControl('minimize')}
            />
            <IconButton
              className="window-control"
              icon="maximize"
              label={tr('App.maximizeWindow')}
              onPress={() => void window.nixel.windowControl('maximize')}
            />
            <IconButton
              className="window-control window-close"
              icon="close"
              label={tr('App.closeWindow')}
              onPress={() => void window.nixel.windowControl('close')}
            />
          </fieldset>
        </div>
      </header>
      <main className={`main-view ${home ? 'main-home' : 'main-managed'}`}>
        {a.hostError && (
          <div className="recovery">
            <Tile icon="plugin" color="amber" size="lg" />
            <Tag color="warning">{tr('App.recoveryMode')}</Tag>
            <h1>{tr('App.pluginServicesAreUnavailable')}</h1>
            <p>{a.hostMessage || tr('App.restartPluginServicesToReconnect')}</p>
            <div className="row">
              <Action icon="refresh" onPress={() => void a.restartHost()}>
                {tr('App.restartServices')}
              </Action>
              <ApplicationLogsAction />
            </div>
          </div>
        )}
        {Object.entries(views).map(([id, View]) => (
          <div key={id} className="page-content" hidden={a.hostError || a.page !== id}>
            <View />
          </div>
        ))}
      </main>
      <TaskDrawer />
      <Overlays />
      <Toast.Provider placement="bottom" />
    </div>
  );
}
export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
