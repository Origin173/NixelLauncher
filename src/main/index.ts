import { mkdirSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  autoUpdater as nativeAutoUpdater,
  nativeImage,
  shell,
  Tray,
} from 'electron';
import appIcon from '../../resources/nixel.png?asset';
import { defaultState } from '../host/defaults';
import type { PlatformOperation } from '../host/protocol';
import type { LauncherSnapshot, PathOptions } from '../shared/contracts';
import { i18n, setLocale, tr } from '../shared/i18n';
import type { NetworkConfiguration } from '../shared/network';
import { readUpdateEnvironment } from './app-updates/configuration';
import type { ApplicationUpdater } from './app-updates/controller';
import { UpdateInstallation } from './app-updates/handoff';
import { createApplicationUpdater } from './app-updates/platform';
import { loadEnvironment } from './environment';
import { HostClient } from './host-client';
import { configureProxy, installProxyAuthentication, resolveProxy } from './network';
import { SecretStorage } from './secrets';

let window: BrowserWindow | undefined;
let host: HostClient;
let secrets: SecretStorage;
let snapshot: LauncherSnapshot;
let rendererUrl = '';
let customInterface = '';
let tray: Tray | undefined;
let quitting = false;
let restoreAfterGame = false;
let updates: ApplicationUpdater;
let updateInstallation: UpdateInstallation;
const defaultRenderer = join(__dirname, '../renderer/index.html');

const environmentDirectory = app.isPackaged
  ? (process.platform === 'win32' && process.env.PORTABLE_EXECUTABLE_DIR) ||
    (process.platform === 'linux' && process.env.APPIMAGE && dirname(process.env.APPIMAGE)) ||
    dirname(app.getPath('exe'))
  : app.getAppPath();
loadEnvironment(environmentDirectory);
const updateEnvironment = readUpdateEnvironment();

if (process.env.NIXEL_DATA_DIR && isAbsolute(process.env.NIXEL_DATA_DIR)) {
  mkdirSync(process.env.NIXEL_DATA_DIR, { recursive: true });
  app.setPath('userData', process.env.NIXEL_DATA_DIR);
}

const ownsDataDirectory = app.requestSingleInstanceLock();
if (!ownsDataDirectory) app.quit();
app.on('second-instance', () => {
  if (app.isReady() && snapshot) showWindow();
});

function showWindow() {
  restoreAfterGame = false;
  if (!window) createWindow();
  if (window?.isMinimized()) window.restore();
  window?.show();
  window?.focus();
}

function hideToTray() {
  if (!tray) {
    tray = new Tray(nativeImage.createFromPath(appIcon).resize({ width: 24, height: 24 }));
    tray.setToolTip('NixelLauncher');
    updateTrayMenu();
    tray.on('double-click', showWindow);
  }
  window?.hide();
}

function updateTrayMenu() {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: tr('index.showNixellauncher'), click: showWindow },
      { type: 'separator' },
      { label: tr('index.quitNixellauncher'), click: () => app.quit() },
    ]),
  );
}

function pushSnapshot() {
  if (window && !window.isDestroyed()) window.webContents.send('nixel:state', snapshot);
}

function validateSender(event: IpcMainInvokeEvent) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    event.senderFrame.url !== rendererUrl
  )
    throw new Error(tr('index.invalidIpcSender'));
}

function handle<Args extends unknown[]>(channel: string, handler: (...args: Args) => unknown) {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    validateSender(event);
    return handler(...(args as Args));
  });
}

async function loadInterface(path = '') {
  customInterface = path;
  if (!window || window.isDestroyed()) return;
  const developmentUrl = !path && !app.isPackaged && process.env.ELECTRON_RENDERER_URL;
  rendererUrl = developmentUrl
    ? new URL(developmentUrl).href
    : pathToFileURL(path || defaultRenderer).href;
  try {
    await window.loadURL(rendererUrl);
  } catch (error) {
    if (!path) throw error;
    customInterface = '';
    rendererUrl = pathToFileURL(defaultRenderer).href;
    await window.loadURL(rendererUrl);
    throw new Error(tr('index.failedToLoadInterfacePluginValue', { value1: String(error) }));
  }
}

async function selectPath(options: PathOptions): Promise<string | null> {
  if (!window) return null;
  if (!options || !['file', 'directory', 'save'].includes(options.kind))
    throw new Error(tr('index.invalidPathSelectionType'));
  const shared = {
    title: options.title,
    defaultPath: options.defaultPath,
    filters: options.filters,
  };
  if (options.kind === 'save') {
    const result = await dialog.showSaveDialog(window, shared);
    return result.canceled ? null : (result.filePath ?? null);
  }
  const result = await dialog.showOpenDialog(window, {
    ...shared,
    properties: options.kind === 'directory' ? ['openDirectory', 'createDirectory'] : ['openFile'],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

async function openExternal(value: string) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol))
    throw new Error(tr('index.onlyHttpAndHttpsLinksAreSupported'));
  await shell.openExternal(url.href);
}

async function openPath(path: string) {
  if (!isAbsolute(path)) throw new Error(tr('index.thePathMustBeAbsolute'));
  const error = await shell.openPath(path);
  if (error) throw new Error(error);
}

async function platform(operation: PlatformOperation, payload: unknown) {
  const values = payload as Record<string, string>;
  switch (operation) {
    case 'appUpdates':
      switch (values.action) {
        case 'status':
          return updates.status();
        case 'check':
          return updates.check();
        case 'download':
          return updates.download();
        case 'cancel':
          return updates.cancel();
        case 'install':
          return updateInstallation.request();
        default:
          throw new Error(tr('appUpdates.invalidAction'));
      }
    case 'network.configure':
      return configureProxy(payload as NetworkConfiguration, secrets);
    case 'network.resolveProxy':
      return resolveProxy(values.url ?? '');
    case 'secret.get':
      return secrets.get(values.key ?? '') ?? null;
    case 'secret.set':
      return secrets.set(values.key ?? '', values.value ?? '');
    case 'secret.delete':
      return secrets.delete(values.key ?? '');
    case 'url.open':
      return openExternal(values.url ?? '');
    case 'path.open':
      return openPath(values.path ?? '');
    case 'ui.load':
      return loadInterface(values.path ?? '');
    case 'directory.select':
      return selectPath({ kind: 'directory' });
    case 'plugin.select':
      return selectPath({
        kind: 'directory',
        title: tr('index.chooseATrustedLocalPluginDirectory'),
      });
  }
}

function registerIpc() {
  handle('nixel:snapshot', () => snapshot);
  handle('nixel:invoke', (command: string, params?: unknown) => {
    if (updateInstallation.frozen) throw new Error(tr('appUpdates.installing'));
    if (typeof command !== 'string' || !/^[a-zA-Z][\w.-]+$/.test(command))
      throw new Error(tr('index.invalidCommandFormat'));
    if (snapshot.host.status !== 'ready') throw new Error(tr('index.thePluginHostIsNotReadyWait'));
    return host.command(command, params);
  });
  handle('nixel:select-path', selectPath);
  handle('nixel:select-files', async (options: Omit<PathOptions, 'kind'>) => {
    if (!window) return [];
    const result = await dialog.showOpenDialog(window, {
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters,
      properties: ['openFile', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });
  handle('nixel:open-path', openPath);
  handle('nixel:open-external', openExternal);
  handle('nixel:read-image', async (path: string) => {
    if (path.startsWith('file:')) path = fileURLToPath(path);
    if (!isAbsolute(path)) throw new Error(tr('index.theImagePathMustBeAbsolute'));
    const mime = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    }[extname(path).toLowerCase()];
    if (!mime || (await stat(path)).size > 20 * 1024 * 1024)
      throw new Error(tr('index.chooseAPngJpegWebpOrGif'));
    const bytes = await readFile(path);
    const valid =
      (mime === 'image/png' &&
        bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
      (mime === 'image/webp' &&
        bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WEBP') ||
      (mime === 'image/gif' && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)));
    if (!valid) throw new Error(tr('index.thisFileIsNotASupportedImage'));
    return `data:${mime};base64,${bytes.toString('base64')}`;
  });
  handle('nixel:window', (action: 'minimize' | 'maximize' | 'close') => {
    if (!window) return;
    if (action === 'minimize') window.minimize();
    else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
    else if (action === 'close') window.close();
    else throw new Error(tr('index.invalidWindowOperation'));
  });
  handle('nixel:restart-host', async () => {
    if (updateInstallation.frozen) throw new Error(tr('appUpdates.installing'));
    updates.cancel();
    await host.restart();
  });
}

function createWindow() {
  app.dock?.setIcon(appIcon);
  window = new BrowserWindow({
    icon: appIcon,
    title: 'NixelLauncher',
    width: 1080,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#f6f5f0',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('before-input-event', (_event, input) => {
    if (input.control && input.shift && input.key === 'F12') {
      void host
        .command('settings.update', { interfacePlugin: 'nixel.ui.default' })
        .catch(console.error);
    }
  });
  window.on('closed', () => {
    window = undefined;
  });
  window.on('close', (event) => {
    if (
      !quitting &&
      (snapshot.running.length || snapshot.tasks.some((task) => task.status === 'running'))
    ) {
      event.preventDefault();
      hideToTray();
    }
  });
  void loadInterface(customInterface).catch(console.error);
}

void app.whenReady().then(async () => {
  if (!ownsDataDirectory) return;
  const dataPath = app.getPath('userData');
  const state = defaultState(dataPath);
  snapshot = {
    ...state,
    plugins: [],
    providers: [],
    tasks: [],
    running: [],
    host: { status: 'starting' },
    appVersion: app.getVersion(),
    dataDirectory: dataPath,
  };
  secrets = new SecretStorage(dataPath);
  await secrets.load();
  installProxyAuthentication();
  updates = await createApplicationUpdater(
    updateEnvironment,
    (error) => void updateInstallation.failed(error),
  );
  host = new HostClient(
    {
      dataPath,
      appVersion: app.getVersion(),
      rendererPath: defaultRenderer,
      systemLocale: app.getLocale(),
    },
    (value) => {
      const previousRunning = new Set(snapshot.running);
      snapshot = value as LauncherSnapshot;
      const previousLanguage = i18n.language;
      setLocale(snapshot.settings.locale, app.getLocale());
      if (previousLanguage !== i18n.language) updateTrayMenu();
      if (
        snapshot.settings.closeAfterLaunch &&
        snapshot.running.some((id) => !previousRunning.has(id))
      ) {
        restoreAfterGame = true;
        hideToTray();
      } else if (
        restoreAfterGame &&
        previousRunning.size > 0 &&
        snapshot.running.length === 0 &&
        window &&
        !window.isVisible() &&
        !quitting
      )
        showWindow();
      pushSnapshot();
    },
    (status, error) => {
      snapshot.host = { ...snapshot.host, status: status === 'crashed' ? 'error' : status, error };
      if (status === 'crashed') {
        updates.cancel();
        void configureProxy({ mode: 'system', proxyUrl: '' }, secrets).catch(() => {
          console.warn(tr('proxyAuth.configureFailed'));
        });
        snapshot.running = [];
        snapshot.tasks = snapshot.tasks.map((task) =>
          task.status === 'running'
            ? {
                ...task,
                status: 'failed',
                error: tr('index.theHostExitedStartTheOperationAgain'),
                finishedAt: new Date().toISOString(),
              }
            : task,
        );
        if (!quitting && window && !window.isVisible()) showWindow();
      }
      pushSnapshot();
    },
    platform,
  );
  updateInstallation = new UpdateInstallation(
    updates,
    host,
    () => snapshot,
    () => {
      snapshot.host.error = tr('appUpdates.recoveryFailed');
      pushSnapshot();
    },
  );
  registerIpc();
  nativeAutoUpdater.on('before-quit-for-update', () => updateInstallation.beforeQuitForUpdate());
  createWindow();
  host.start();
  app.on('activate', () => {
    showWindow();
  });
});

let shutdownComplete = false;
app.on('before-quit', (event) => {
  if (updateInstallation?.consumeFailedUpdateQuit()) {
    event.preventDefault();
    return;
  }
  updates?.cancel();
  quitting = true;
  if (!host || shutdownComplete) return;
  event.preventDefault();
  void host.stop().finally(() => {
    shutdownComplete = true;
    app.quit();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
