import { Tabs, Toast } from '@heroui/react';
import { useEffect } from 'react';
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
import { AppProvider, useApp } from './state';
import { Action, IconButton, Tag, Tile } from './ui';

const navigation: { id: Page; name: string; icon: IconName }[] = [
  { id: 'home', name: '主页', icon: 'home' },
  { id: 'instances', name: '实例', icon: 'box' },
  { id: 'resources', name: '资源', icon: 'compass' },
  { id: 'plugins', name: '插件', icon: 'plugin' },
  { id: 'accounts', name: '账号', icon: 'user' },
  { id: 'settings', name: '设置', icon: 'settings' },
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
          aria-label="Nixel 主页"
        >
          <Brand size={24} />
          <span>
            Nixel<span className="brand-suffix">Launcher</span>
          </span>
        </button>
        <nav className="main-nav" aria-label="主导航">
          <Tabs
            variant="secondary"
            selectedKey={a.page}
            onSelectionChange={(key) => {
              a.setPage(String(key) as Page);
            }}
          >
            <Tabs.ListContainer className="titlebar-tabs">
              <Tabs.List aria-label="主导航">
                {navigation.map((n) => (
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
            label="全局搜索 · Ctrl K"
            onPress={() => a.setOverlay({ type: 'search' })}
          />
          <div className="task-trigger">
            <IconButton icon="download" label="打开任务中心" onPress={() => a.setTaskOpen(true)} />
            {count > 0 && <span className="count-badge">{count}</span>}
          </div>
          <span className="toolbar-divider" />
          <fieldset className="window-controls" aria-label="窗口控制">
            <IconButton
              className="window-control"
              icon="minimize"
              label="最小化窗口"
              onPress={() => void window.nixel.windowControl('minimize')}
            />
            <IconButton
              className="window-control"
              icon="maximize"
              label="最大化窗口"
              onPress={() => void window.nixel.windowControl('maximize')}
            />
            <IconButton
              className="window-control window-close"
              icon="close"
              label="关闭窗口"
              onPress={() => void window.nixel.windowControl('close')}
            />
          </fieldset>
        </div>
      </header>
      <main className={`main-view ${home ? 'main-home' : 'main-managed'}`}>
        {a.hostError && (
          <div className="recovery">
            <Tile icon="plugin" color="amber" size="lg" />
            <Tag color="warning">恢复模式</Tag>
            <h1>插件服务暂时不可用</h1>
            <p>{a.hostMessage || '重新启动插件服务以恢复连接。'}</p>
            <div className="row">
              <Action icon="refresh" onPress={() => void a.restartHost()}>
                重新启动服务
              </Action>
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
