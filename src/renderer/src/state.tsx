import { toast } from '@heroui/react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type {
  LauncherSettings,
  LauncherSnapshot,
  Page,
  Resource,
  ResourceQuery,
  ResourceSearchResult,
} from '../../shared/contracts';
import { i18n, setLocale, tr } from '../../shared/i18n';
import { launchAccountId } from '../../shared/launch-account';

export type Overlay =
  | { type: 'create' | 'import' | 'background' | 'wizard' | 'search' | 'local-plugin' }
  | { type: 'account'; instanceId?: string }
  | { type: 'resource'; resource: Resource; instanceId?: string }
  | { type: 'plugin'; pluginId: string }
  | { type: 'launch-account'; instanceId: string; accountId?: string }
  | { type: 'confirm'; title: string; detail: string; action: () => Promise<unknown> }
  | null;
const defaults: LauncherSettings = {
  locale: 'system',
  theme: 'system',
  motion: true,
  background: 'alpine',
  dim: 0,
  memory: 4096,
  javaPath: '',
  autoDownloadJava: true,
  jvmArgs: [],
  gameArgs: [],
  resolution: { width: 1280, height: 720 },
  fullscreen: false,
  instanceDirectory: '',
  defaultAccount: '',
  launchInstance: '',
  launchAccount: '',
  interfacePlugin: 'nixel.ui.default',
  downloadConcurrency: 8,
  closeAfterLaunch: false,
  setupComplete: false,
  providers: {
    game: 'nixel.game.minecraft',
    resources: 'nixel.resources.modrinth',
    accounts: 'nixel.accounts.offline',
  },
};
const initial: LauncherSnapshot = {
  instances: [],
  accounts: [],
  content: [],
  plugins: [],
  tasks: [],
  providers: [],
  running: [],
  settings: defaults,
  host: { status: 'starting' },
  appVersion: '',
  dataDirectory: '',
};
const Context = createContext<ReturnType<typeof useAppState> | null>(null);
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('App context missing');
  return value;
}
function useAppState() {
  useTranslation(undefined, { i18n });
  const [snapshot, setSnapshot] = useState<LauncherSnapshot>(initial);
  const [page, setPage] = useState<Page>('home');
  const [selectedId, setSelectedId] = useState('');
  const [resourceCategory, setResourceCategory] = useState('mods');
  const [instanceCatalogOpen, setInstanceCatalogOpen] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('general');
  const [instanceTab, setInstanceTab] = useState('overview');
  const [connectionError, setConnectionError] = useState('');
  const [wallpaper, setWallpaper] = useState('alpine');
  const initialized = useRef(false);
  useEffect(() => {
    const receive = (next: LauncherSnapshot) => {
      setLocale(next.settings.locale, navigator.language);
      document.documentElement.lang = i18n.language;
      setSnapshot(next);
      setConnectionError('');
      if (!initialized.current && next.host.status === 'ready') {
        initialized.current = true;
        if (!next.settings.setupComplete) setOverlay({ type: 'wizard' });
      }
    };
    const unsubscribe = window.nixel.onState(receive);
    window.nixel
      .getSnapshot()
      .then(receive)
      .catch((e: Error) => setConnectionError(e.message));
    return unsubscribe;
  }, []);
  const command = useCallback(
    async <T,>(name: string, params?: unknown): Promise<T | undefined> => {
      try {
        return await window.nixel.invoke<T>(name, params);
      } catch (error) {
        toast.danger(tr('state.operationFailed'), {
          description: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      }
    },
    [],
  );
  const updateSettings = useCallback(
    (patch: Partial<LauncherSettings>) => command<void>('settings.update', patch),
    [command],
  );
  const searchResources = useCallback(async (params: ResourceQuery) => {
    const data = await window.nixel.invoke<ResourceSearchResult>('resources.search', params);
    return { ...data, results: data.items };
  }, []);
  const s = snapshot.settings;
  useEffect(() => {
    const path = s.background;
    if (path === 'none' || path === 'alpine' || path.startsWith('data:')) {
      setWallpaper(path);
      return;
    }
    let active = true;
    window.nixel
      .readImage(path)
      .then((image) => {
        if (active) setWallpaper(image);
      })
      .catch(() => {
        if (active) {
          setWallpaper('alpine');
          toast.danger(tr('state.cannotReadTheBackgroundImageUsingThe'));
        }
      });
    return () => {
      active = false;
    };
  }, [s.background]);
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', !s.motion);
  }, [s.motion]);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      const dark = s.theme === 'dark' || (s.theme === 'system' && query.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [s.theme]);
  const current = snapshot.instances.find((i) => i.id === selectedId) ?? snapshot.instances[0];
  const launchInstance = snapshot.instances.find((i) => i.id === s.launchInstance) ?? current;
  const openInstance = (id: string, tab = 'overview') => {
    setSelectedId(id);
    setInstanceTab(tab);
    setInstanceCatalogOpen(false);
    setPage('instances');
  };
  const launch = (id: string, accountId?: string) => {
    if (snapshot.running.includes(id)) {
      void command('instances.stop', { id });
      return;
    }
    const instance = snapshot.instances.find((i) => i.id === id);
    if (!instance) return;
    const selectedId = launchAccountId(instance, s, accountId);
    const account = snapshot.accounts.find((entry) => entry.id === selectedId);
    if (
      !account ||
      !snapshot.providers.some(
        (provider) => provider.kind === 'accounts' && provider.id === account.provider,
      ) ||
      (instance.providers.accounts && instance.providers.accounts !== account.provider)
    ) {
      setOverlay({ type: snapshot.accounts.length ? 'launch-account' : 'account', instanceId: id });
      return;
    }
    void command('instances.launch', { id, accountId: account.id });
  };
  return {
    ...snapshot,
    settings: s,
    page,
    setPage,
    selectedId,
    setSelectedId,
    current,
    launchInstance,
    launchId: s.launchInstance,
    setLaunchId: (launchInstance: string) =>
      void updateSettings({
        launchInstance,
        launchAccount: launchInstance === s.launchInstance ? s.launchAccount : '',
      }),
    launchAccountId: s.launchAccount,
    setLaunchAccountId: (launchAccount: string) =>
      void updateSettings({
        launchAccount,
        launchInstance: launchInstance?.id ?? '',
      }),
    defaultAccount: s.defaultAccount,
    setDefaultAccount: (defaultAccount: string) => void updateSettings({ defaultAccount }),
    resourceCategory,
    setResourceCategory,
    instanceCatalogOpen,
    setInstanceCatalogOpen,
    overlay,
    setOverlay,
    taskOpen,
    setTaskOpen,
    settingsTab,
    setSettingsTab,
    instanceTab,
    setInstanceTab,
    theme: s.theme,
    setTheme: (theme: LauncherSettings['theme']) => void updateSettings({ theme }),
    motion: s.motion,
    setMotion: (motion: boolean) => void updateSettings({ motion }),
    background: wallpaper,
    setBackground: (background: string) => void updateSettings({ background }),
    dim: s.dim,
    setDim: (dim: number) => void updateSettings({ dim }),
    memory: s.memory,
    setMemory: (memory: number) => void updateSettings({ memory }),
    empty: snapshot.instances.length === 0,
    hostError: snapshot.host.status === 'error' || Boolean(connectionError),
    hostMessage: connectionError || snapshot.host.error || '',
    command,
    updateSettings,
    searchResources,
    openInstance,
    launch,
    cancelTask: (id: string) => void command('tasks.cancel', { id }),
    retryTask: (task: { id: string }) => void command('tasks.retry', { id: task.id }),
    clearTasks: () => void command('tasks.clear'),
    restartHost: () =>
      window.nixel.restartHost().catch((e: Error) => setConnectionError(e.message)),
  };
}
export function AppProvider({ children }: { children: ReactNode }) {
  return <Context value={useAppState()}>{children}</Context>;
}
