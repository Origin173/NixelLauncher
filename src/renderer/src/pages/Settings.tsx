import { useCallback, useEffect, useState } from 'react';
import type { JavaRuntime } from '../../../shared/contracts';
import { Landscape } from '../Landscape';
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
  Segments,
  SettingRow,
  Tag,
  Toggle,
} from '../ui';
import { NavList, Workspace } from '../workspace';

const groups = [
  { id: 'general', name: '通用', icon: 'settings' },
  { id: 'appearance', name: '外观与背景', icon: 'palette' },
  { id: 'game', name: '全局游戏配置', icon: 'sliders' },
  { id: 'java', name: 'Java 运行环境', icon: 'cpu' },
  { id: 'downloads', name: '下载与网络', icon: 'download' },
  { id: 'storage', name: '存储与数据', icon: 'folder' },
  { id: 'about', name: '关于 Nixel', icon: 'info' },
] as const;
export function SettingsPage() {
  const a = useApp();
  const s = a.settings;
  const interfaces = a.providers.filter((provider) => provider.kind === 'interface');
  return (
    <Workspace
      title="设置"
      sidebar={
        <NavList
          label="设置分类"
          value={a.settingsTab}
          onChange={a.setSettingsTab}
          items={[...groups]}
        />
      }
    >
      <Heading title={groups.find((g) => g.id === a.settingsTab)?.name ?? '设置'} />
      <div className="settings-content panel-enter" key={a.settingsTab}>
        {a.settingsTab === 'appearance' && (
          <>
            <Group title="界面主题">
              <SettingRow title="配色">
                <Segments
                  value={a.theme === 'dark' ? '深色' : a.theme === 'system' ? '跟随系统' : '浅色'}
                  options={['浅色', '深色', '跟随系统']}
                  onChange={(v) =>
                    a.setTheme(v === '深色' ? 'dark' : v === '浅色' ? 'light' : 'system')
                  }
                />
              </SettingRow>
              <SettingRow title="界面动效">
                <Toggle label="界面动效" value={a.motion} onChange={a.setMotion} />
              </SettingRow>
              {interfaces.length > 1 && (
                <SettingRow title="启动器界面">
                  <Choice
                    label="界面插件"
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
            <Group title="背景">
              {a.background !== 'none' && (
                <div className="background-preview">
                  {a.background.startsWith('data:') ? (
                    <img src={a.background} alt="当前背景" />
                  ) : (
                    <Landscape variant={a.background} />
                  )}
                </div>
              )}
              <SettingRow title="背景图片" description="背景贯穿主页、管理页面和标题栏。">
                <Action
                  variant="secondary"
                  size="sm"
                  icon="image"
                  onPress={() => a.setOverlay({ type: 'background' })}
                >
                  更换背景
                </Action>
              </SettingRow>
              <div className="padded">
                <Range label="背景遮罩" value={a.dim} onChange={a.setDim} />
              </div>
            </Group>
          </>
        )}
        {a.settingsTab === 'general' && (
          <Group title="启动器">
            <SettingRow
              title="游戏启动后隐藏主窗口"
              description="游戏与任务继续在后台运行，可从系统托盘恢复窗口。"
            >
              <Toggle
                label="游戏启动后隐藏主窗口"
                value={s.closeAfterLaunch}
                onChange={(closeAfterLaunch) => void a.updateSettings({ closeAfterLaunch })}
              />
            </SettingRow>
            <SettingRow title="首次设置" description="重新选择 Java 与添加账号。">
              <Action
                variant="secondary"
                size="sm"
                onPress={() => a.setOverlay({ type: 'wizard' })}
              >
                打开设置向导
              </Action>
            </SettingRow>
          </Group>
        )}
        {a.settingsTab === 'game' && (
          <>
            <Group title="内存">
              <div className="padded">
                <Range
                  label="默认内存上限"
                  min={1}
                  max={32}
                  value={a.memory / 1024}
                  onChange={(v) => a.setMemory(v * 1024)}
                  suffix=" GB"
                />
              </div>
            </Group>
            <LaunchOptions />
            <Group title="启动账号">
              <SettingRow title="全局默认账号">
                <Choice
                  label="默认账号"
                  value={a.defaultAccount}
                  onChange={a.setDefaultAccount}
                  options={[
                    { id: '', name: '尚未选择' },
                    ...a.accounts.map((p) => ({ id: p.id, name: p.name })),
                  ]}
                />
              </SettingRow>
            </Group>
          </>
        )}
        {a.settingsTab === 'java' && <JavaSettings />}
        {a.settingsTab === 'downloads' && (
          <Group title="下载">
            <SettingRow title="并发下载数量" description="用于游戏资源与依赖下载。">
              <Choice
                label="下载并发数"
                value={String(s.downloadConcurrency)}
                onChange={(v) => void a.updateSettings({ downloadConcurrency: Number(v) })}
                options={[2, 4, 8, 16].map((v) => ({ id: String(v), name: String(v) }))}
              />
            </SettingRow>
          </Group>
        )}
        {a.settingsTab === 'storage' && (
          <Group title="本地目录">
            <SettingRow
              title="实例存储目录"
              description={s.instanceDirectory || '使用应用数据目录内的 instances 文件夹。'}
            >
              <Action
                size="sm"
                variant="secondary"
                icon="folder"
                onPress={() =>
                  void window.nixel
                    .selectPath({ kind: 'directory', title: '选择新实例保存目录' })
                    .then((path) => {
                      if (path) void a.updateSettings({ instanceDirectory: path });
                    })
                }
              >
                选择目录
              </Action>
            </SettingRow>
            <SettingRow title="启动器数据" description={a.dataDirectory}>
              <Action
                size="sm"
                variant="secondary"
                icon="folder"
                onPress={() => void window.nixel.openPath(a.dataDirectory)}
              >
                打开目录
              </Action>
            </SettingRow>
          </Group>
        )}
        {a.settingsTab === 'about' && (
          <>
            <Group title="NixelLauncher">
              <SettingRow title="版本">
                <Tag>{a.appVersion}</Tag>
              </SettingRow>
              <SettingRow title="运行平台">
                <span>{window.nixel.platform}</span>
              </SettingRow>
              <SettingRow title="插件 Host">
                <span>
                  {a.host.status}
                  {a.host.pid ? ` · PID ${a.host.pid}` : ''}
                </span>
              </SettingRow>
              <SettingRow title="服务管理">
                <Action
                  variant="secondary"
                  size="sm"
                  icon="refresh"
                  onPress={() => void a.restartHost()}
                >
                  重新启动 Host
                </Action>
              </SettingRow>
            </Group>
            <p className="muted">Minecraft Java 版启动器 · Electron、React、HeroUI 与 Cordis。</p>
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
      title="Java 运行环境"
      description="Minecraft 不同版本需要对应的 Java 主版本。可以使用自动检测，或选择本机可执行文件。"
    >
      <SettingRow title="自动下载所需 Java" description="启动游戏时自动安装缺少的对应版本。">
        <Toggle
          label="自动下载 Java"
          value={a.settings.autoDownloadJava}
          onChange={(autoDownloadJava) => void a.updateSettings({ autoDownloadJava })}
        />
      </SettingRow>
      <SettingRow title="下载 Java" description="运行环境由启动器管理，无需手动配置路径。">
        <div className="row">
          <Choice
            label="Java 主版本"
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
            下载
          </Action>
        </div>
      </SettingRow>
      <SettingRow title="自动检测">
        <Action
          variant="secondary"
          size="sm"
          icon="refresh"
          isPending={loading}
          onPress={() => void detect()}
        >
          检测本机 Java
        </Action>
      </SettingRow>
      <div className="padded stack">
        <Field label="Java 可执行文件" value={path} onChange={setPath} placeholder="留空自动选择" />
        <div className="row">
          <Action
            size="sm"
            variant="secondary"
            icon="folder"
            onPress={() =>
              void window.nixel
                .selectPath({ kind: 'file', title: '选择 Java 可执行文件' })
                .then((p) => {
                  if (p) setPath(p);
                })
            }
          >
            选择文件
          </Action>
          <Action size="sm" icon="check" isPending={loading} onPress={() => void save()}>
            验证并保存
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
            {path === r.path && <Tag>已选择</Tag>}
          </button>
        ))}
        {!loading && !runtimes.length && (
          <p className="muted">
            没有检测到 Java。可在上方下载，或启用自动下载后直接创建并启动游戏。
          </p>
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
    <Group title="启动选项">
      {instanceId && (
        <SettingRow title="继承全局启动选项">
          <Toggle label="继承全局启动选项" value={inherit} onChange={setInherit} />
        </SettingRow>
      )}
      {!inherit && (
        <div className="padded stack">
          <ArgumentField label="JVM 参数" value={jvm} onChange={setJvm} />
          <ArgumentField label="游戏参数" value={game} onChange={setGame} />
          <div className="row">
            <Field label="窗口宽度" type="number" value={width} onChange={setWidth} />
            <Field label="窗口高度" type="number" value={height} onChange={setHeight} />
          </div>
          <SettingRow title="全屏启动">
            <Toggle label="全屏启动" value={fullscreen} onChange={setFullscreen} />
          </SettingRow>
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
          保存启动选项
        </Action>
      </div>
    </Group>
  );
}
