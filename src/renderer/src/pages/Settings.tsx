import { useCallback, useEffect, useState } from 'react';
import type { JavaRuntime } from '../../../shared/contracts';
import { label, tr } from '../../../shared/i18n';
import { Landscape } from '../Landscape';
import { BackupRetention } from '../settings/BackupRetention';
import { NetworkSettings } from '../settings/NetworkSettings';
import { useApp } from '../state';
import {
  Action,
  ArgumentField,
  Choice,
  Field,
  Group,
  Heading,
  Notice,
  Range,
  Search,
  Segments,
  SettingRow,
  Tag,
  Toggle,
} from '../ui';
import { NavList, Workspace } from '../workspace';

const settingGroups = () =>
  [
    {
      id: 'general',
      name: tr('Settings.generalLanguage'),
      icon: 'settings',
      keywords: tr('Settings.languageChineseEnglishTrayWindowSetup'),
    },
    {
      id: 'appearance',
      name: tr('Settings.appearance'),
      icon: 'palette',
      keywords: tr('Settings.themeColorsBackgroundMotionInterface'),
    },
    {
      id: 'game',
      name: tr('Settings.gameDefaults'),
      icon: 'sliders',
      keywords: tr('Settings.memoryAccountResolutionFullscreenArgumentsJvm'),
    },
    {
      id: 'java',
      name: tr('Settings.javaRuntimes'),
      icon: 'cpu',
      keywords: tr('Settings.javaDownloadVersionPathDetect'),
    },
    {
      id: 'downloads',
      name: tr('Settings.downloads'),
      icon: 'download',
      keywords: tr('network.keywords'),
    },
    {
      id: 'storage',
      name: tr('Settings.storageData'),
      icon: 'folder',
      keywords: tr('backupRetention.keywords'),
    },
    {
      id: 'about',
      name: tr('Settings.aboutNixel'),
      icon: 'info',
      keywords: tr('Settings.versionPlatformHostServices'),
    },
  ] as const;
export function SettingsPage() {
  const a = useApp();
  const s = a.settings;
  const [query, setQuery] = useState('');
  const groups = settingGroups();
  const visibleGroups = groups.filter((group) =>
    `${group.name} ${group.keywords}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const interfaces = a.providers.filter((provider) => provider.kind === 'interface');
  return (
    <Workspace
      title={tr('App.settings')}
      sidebar={
        <>
          <Search value={query} onChange={setQuery} placeholder={tr('Settings.findSettings')} />
          <NavList
            label={tr('Settings.settingsCategories')}
            value={a.settingsTab}
            onChange={a.setSettingsTab}
            items={visibleGroups}
          />
        </>
      }
    >
      <Heading title={groups.find((g) => g.id === a.settingsTab)?.name ?? tr('App.settings')} />
      <div className="settings-content panel-enter" key={a.settingsTab}>
        {a.settingsTab === 'appearance' && (
          <>
            <Group title={tr('Settings.interfaceTheme')}>
              <SettingRow title={tr('Settings.colors')}>
                <Segments
                  value={a.theme === 'dark' ? 'dark' : a.theme === 'system' ? 'system' : 'light'}
                  options={['light', 'dark', 'system']}
                  onChange={(v) =>
                    a.setTheme(v === 'dark' ? 'dark' : v === 'light' ? 'light' : 'system')
                  }
                />
              </SettingRow>
              <SettingRow title={tr('Settings.animations')}>
                <Toggle label={tr('Settings.animations')} value={a.motion} onChange={a.setMotion} />
              </SettingRow>
              {interfaces.length > 1 && (
                <SettingRow title={tr('Settings.launcherInterface')}>
                  <Choice
                    label={tr('Settings.interfacePlugin')}
                    value={s.interfacePlugin}
                    onChange={(interfacePlugin) => void a.updateSettings({ interfacePlugin })}
                    options={interfaces.map((provider) => ({
                      id: provider.id,
                      name: provider.name,
                    }))}
                  />
                </SettingRow>
              )}
            </Group>
            <Group title={tr('Settings.background')}>
              {a.background !== 'none' && (
                <div className="background-preview">
                  {a.background.startsWith('data:') ? (
                    <img src={a.background} alt={tr('Settings.currentBackground')} />
                  ) : (
                    <Landscape variant={a.background} />
                  )}
                </div>
              )}
              <SettingRow
                title={tr('Settings.backgroundImage')}
                description={tr('Settings.theBackgroundContinuesAcrossHomeManagementPages')}
              >
                <Action
                  variant="secondary"
                  size="sm"
                  icon="image"
                  onPress={() => a.setOverlay({ type: 'background' })}
                >
                  {tr('overlays.changeBackground')}
                </Action>
              </SettingRow>
              <div className="padded">
                <Range label={tr('Settings.backgroundDimming')} value={a.dim} onChange={a.setDim} />
              </div>
            </Group>
          </>
        )}
        {a.settingsTab === 'general' && (
          <Group title={tr('Settings.preferences')}>
            <SettingRow title={tr('Settings.language')}>
              <Choice
                label={tr('Settings.language')}
                value={s.locale}
                onChange={(locale) => void a.updateSettings({ locale: locale as typeof s.locale })}
                options={[
                  { id: 'system', name: tr('Settings.system') },
                  { id: 'zh-CN', name: tr('Settings.chinese') },
                  { id: 'en-US', name: 'English' },
                ]}
              />
            </SettingRow>
            <SettingRow
              title={tr('Settings.hideLauncherAfterGameStarts')}
              description={tr('Settings.gamesAndTasksContinueInTheBackground')}
            >
              <Toggle
                label={tr('Settings.hideLauncherAfterGameStarts')}
                value={s.closeAfterLaunch}
                onChange={(closeAfterLaunch) => void a.updateSettings({ closeAfterLaunch })}
              />
            </SettingRow>
            <SettingRow
              title={tr('Settings.initialSetup')}
              description={tr('Settings.chooseJavaAndAddAccountsAgain')}
            >
              <Action
                variant="secondary"
                size="sm"
                onPress={() => a.setOverlay({ type: 'wizard' })}
              >
                {tr('Settings.openSetupWizard')}
              </Action>
            </SettingRow>
          </Group>
        )}
        {a.settingsTab === 'game' && (
          <>
            <Group title={tr('Settings.memory')}>
              <div className="padded">
                <Range
                  label={tr('Settings.defaultMemoryLimit')}
                  min={1}
                  max={32}
                  value={a.memory / 1024}
                  onChange={(v) => a.setMemory(v * 1024)}
                  suffix=" GB"
                />
              </div>
            </Group>
            <LaunchOptions />
            <Group title={tr('Home.launchAccount')}>
              <SettingRow title={tr('Settings.globalDefaultAccount')}>
                <Choice
                  label={tr('Settings.defaultAccount')}
                  value={a.defaultAccount}
                  onChange={a.setDefaultAccount}
                  options={[
                    { id: '', name: tr('Settings.notSelected') },
                    ...a.accounts.map((p) => ({ id: p.id, name: p.name })),
                  ]}
                />
              </SettingRow>
            </Group>
          </>
        )}
        {a.settingsTab === 'java' && <JavaSettings />}
        {a.settingsTab === 'downloads' && (
          <>
            <Group title={tr('Settings.download')}>
              <SettingRow
                title={tr('Settings.concurrentDownloads')}
                description={tr('Settings.usedForGameAssetsAndDependencyDownloads')}
              >
                <Choice
                  label={tr('Settings.downloadConcurrency')}
                  value={String(s.downloadConcurrency)}
                  onChange={(v) => void a.updateSettings({ downloadConcurrency: Number(v) })}
                  options={[2, 4, 8, 16].map((v) => ({ id: String(v), name: String(v) }))}
                />
              </SettingRow>
            </Group>
            <NetworkSettings />
          </>
        )}
        {a.settingsTab === 'storage' && (
          <>
            <Group title={tr('Settings.localDirectories')}>
              <SettingRow
                title={tr('Settings.instanceDirectory')}
                description={
                  s.instanceDirectory || tr('Settings.useTheInstancesFolderInTheApplication')
                }
              >
                <Action
                  size="sm"
                  variant="secondary"
                  icon="folder"
                  onPress={() =>
                    void window.nixel
                      .selectPath({
                        kind: 'directory',
                        title: tr('Settings.chooseDirectoryForNewInstances'),
                      })
                      .then((path) => {
                        if (path) void a.updateSettings({ instanceDirectory: path });
                      })
                  }
                >
                  {tr('Settings.chooseDirectory')}
                </Action>
              </SettingRow>
              <SettingRow title={tr('Settings.launcherData')} description={a.dataDirectory}>
                <Action
                  size="sm"
                  variant="secondary"
                  icon="folder"
                  onPress={() => void window.nixel.openPath(a.dataDirectory)}
                >
                  {tr('Instances.openDirectory')}
                </Action>
              </SettingRow>
            </Group>
            <BackupRetention />
          </>
        )}
        {a.settingsTab === 'about' && (
          <>
            <Group title="NixelLauncher">
              <SettingRow title={tr('Settings.version')}>
                <Tag>{a.appVersion}</Tag>
              </SettingRow>
              <SettingRow title={tr('Settings.platform')}>
                <span>{window.nixel.platform}</span>
              </SettingRow>
              <SettingRow title={tr('Settings.pluginHost')}>
                <span>
                  {label(a.host.status)}
                  {a.host.pid ? ` · PID ${a.host.pid}` : ''}
                </span>
              </SettingRow>
              <SettingRow title={tr('Settings.serviceManagement')}>
                <Action
                  variant="secondary"
                  size="sm"
                  icon="refresh"
                  onPress={() => void a.restartHost()}
                >
                  {tr('Settings.restartHost')}
                </Action>
              </SettingRow>
            </Group>
            <p className="muted">{tr('Settings.aMinecraftJavaLauncherBuiltWithElectron')}</p>
          </>
        )}
      </div>
    </Workspace>
  );
}

export function JavaSettings() {
  const a = useApp();
  const [runtimes, setRuntimes] = useState<JavaRuntime[]>([]);
  const [path, setPath] = useState(a.settings.javaPath);
  const [major, setMajor] = useState('21');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const installedJava = a.tasks
    .filter((task) => task.kind === 'java' && task.status === 'completed')
    .map((task) => task.id)
    .join(',');
  useEffect(() => setPath(a.settings.javaPath), [a.settings.javaPath]);
  const detect = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRuntimes(await window.nixel.invoke<JavaRuntime[]>('java.list'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void installedJava;
    void detect();
  }, [detect, installedJava]);
  const save = async () => {
    setLoading(true);
    setError('');
    try {
      if (path) {
        const runtime = await window.nixel.invoke<JavaRuntime>('java.inspect', { path });
        setRuntimes((v) => (v.some((r) => r.path === runtime.path) ? v : [runtime, ...v]));
      }
      await window.nixel.invoke('settings.update', { javaPath: path.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Group
      title={tr('Settings.javaRuntimes')}
      description={tr('Settings.minecraftVersionsRequireSpecificJavaVersionsUse')}
    >
      <SettingRow
        title={tr('Settings.downloadRequiredJavaAutomatically')}
        description={tr('Settings.installAMissingJavaVersionWhenLaunching')}
      >
        <Toggle
          label={tr('Settings.downloadJavaAutomatically')}
          value={a.settings.autoDownloadJava}
          onChange={(autoDownloadJava) => void a.updateSettings({ autoDownloadJava })}
        />
      </SettingRow>
      <SettingRow
        title={tr('Settings.downloadJava')}
        description={tr('Settings.theLauncherManagesThisRuntimeNoPath')}
      >
        <div className="row">
          <Choice
            label={tr('Settings.javaMajorVersion')}
            value={major}
            onChange={setMajor}
            options={[8, 16, 17, 21, 25].map((v) => ({ id: String(v), name: `Java ${v}` }))}
          />
          <Action
            size="sm"
            icon="download"
            isDisabled={a.tasks.some((task) => task.kind === 'java' && task.status === 'running')}
            onPress={async () => {
              await a.command('java.install', { major: Number(major) });
              a.setTaskOpen(true);
            }}
          >
            {tr('Settings.download')}
          </Action>
        </div>
      </SettingRow>
      <SettingRow title={tr('Settings.automaticDetection')}>
        <Action
          variant="secondary"
          size="sm"
          icon="refresh"
          isPending={loading}
          onPress={() => void detect()}
        >
          {tr('Settings.detectLocalJava')}
        </Action>
      </SettingRow>
      <div className="padded stack">
        <Field
          label={tr('Instances.javaExecutable')}
          value={path}
          onChange={setPath}
          placeholder={tr('Settings.leaveEmptyForAutomaticSelection')}
        />
        <div className="row">
          <Action
            size="sm"
            variant="secondary"
            icon="folder"
            onPress={() =>
              void window.nixel
                .selectPath({ kind: 'file', title: tr('Instances.chooseJavaExecutable') })
                .then((p) => {
                  if (p) setPath(p);
                })
            }
          >
            {tr('Settings.chooseFile')}
          </Action>
          <Action size="sm" icon="check" isPending={loading} onPress={() => void save()}>
            {tr('Settings.verifyAndSave')}
          </Action>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        {runtimes.map((r) => (
          <button
            className={`select-option ${path === r.path ? 'selected' : ''}`}
            key={r.path}
            type="button"
            onClick={() => setPath(r.path)}
          >
            <span>
              <strong>Java {r.version}</strong>
              <small>{r.path}</small>
            </span>
            {path === r.path && <Tag>{tr('Settings.selected')}</Tag>}
          </button>
        ))}
        {!loading && !runtimes.length && (
          <p className="muted">{tr('Settings.javaWasNotDetectedDownloadItAbove')}</p>
        )}
      </div>
    </Group>
  );
}

export function LaunchOptions({ instanceId }: { instanceId?: string }) {
  const a = useApp();
  const instance = a.instances.find((entry) => entry.id === instanceId);
  const [inherit, setInherit] = useState(
    Boolean(instanceId) &&
      !instance?.jvmArgs &&
      !instance?.gameArgs &&
      !instance?.resolution &&
      instance?.fullscreen == null,
  );
  const [jvm, setJvm] = useState((instance?.jvmArgs ?? a.settings.jvmArgs).join('\n'));
  const [game, setGame] = useState((instance?.gameArgs ?? a.settings.gameArgs).join('\n'));
  const [width, setWidth] = useState(String((instance?.resolution ?? a.settings.resolution).width));
  const [height, setHeight] = useState(
    String((instance?.resolution ?? a.settings.resolution).height),
  );
  const [fullscreen, setFullscreen] = useState(instance?.fullscreen ?? a.settings.fullscreen);
  const savedOptions = JSON.stringify({
    inherit:
      Boolean(instanceId) &&
      !instance?.jvmArgs &&
      !instance?.gameArgs &&
      !instance?.resolution &&
      instance?.fullscreen == null,
    jvm: instance?.jvmArgs ?? a.settings.jvmArgs,
    game: instance?.gameArgs ?? a.settings.gameArgs,
    resolution: instance?.resolution ?? a.settings.resolution,
    fullscreen: instance?.fullscreen ?? a.settings.fullscreen,
  });
  useEffect(() => {
    const saved = JSON.parse(savedOptions);
    setInherit(saved.inherit);
    setJvm(saved.jvm.join('\n'));
    setGame(saved.game.join('\n'));
    setWidth(String(saved.resolution.width));
    setHeight(String(saved.resolution.height));
    setFullscreen(saved.fullscreen);
  }, [savedOptions]);
  const [saving, setSaving] = useState(false);
  const split = (value: string) =>
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  return (
    <Group title={tr('Settings.launchOptions')}>
      {instanceId && (
        <SettingRow title={tr('Settings.useGlobalLaunchOptions')}>
          <Toggle
            label={tr('Settings.useGlobalLaunchOptions')}
            value={inherit}
            onChange={setInherit}
          />
        </SettingRow>
      )}
      {!inherit && (
        <div className="padded stack">
          <div className="row">
            <Field
              label={tr('Settings.windowWidth')}
              type="number"
              value={width}
              onChange={setWidth}
            />
            <Field
              label={tr('Settings.windowHeight')}
              type="number"
              value={height}
              onChange={setHeight}
            />
          </div>
          <SettingRow title={tr('Settings.startInFullscreen')}>
            <Toggle
              label={tr('Settings.startInFullscreen')}
              value={fullscreen}
              onChange={setFullscreen}
            />
          </SettingRow>
          <details className="advanced-settings">
            <summary>{tr('Settings.advancedArguments')}</summary>
            <div className="stack">
              <ArgumentField label={tr('Settings.jvmArguments')} value={jvm} onChange={setJvm} />
              <ArgumentField label={tr('Settings.gameArguments')} value={game} onChange={setGame} />
            </div>
          </details>
        </div>
      )}
      <div className="padded">
        <Action
          size="sm"
          isDisabled={
            !inherit &&
            (!Number.isInteger(Number(width)) ||
              !Number.isInteger(Number(height)) ||
              Number(width) < 320 ||
              Number(height) < 240 ||
              Number(width) > 16384 ||
              Number(height) > 16384)
          }
          isPending={saving}
          onPress={async () => {
            setSaving(true);
            const patch = {
              jvmArgs: split(jvm),
              gameArgs: split(game),
              resolution: { width: Number(width), height: Number(height) },
              fullscreen,
            };
            if (instanceId)
              await a.command('instances.update', {
                id: instanceId,
                patch: inherit
                  ? { jvmArgs: null, gameArgs: null, resolution: null, fullscreen: null }
                  : patch,
              });
            else await a.updateSettings(patch);
            setSaving(false);
          }}
        >
          {tr('Settings.saveLaunchOptions')}
        </Action>
      </div>
    </Group>
  );
}
