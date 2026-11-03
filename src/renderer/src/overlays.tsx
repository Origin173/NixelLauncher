import { Drawer } from '@heroui/react';
import { useEffect, useState } from 'react';
import type { DeviceLogin, Loader, ResourceVersion, VersionEntry } from '../../shared/contracts';
import type { Resource } from './data';
import { resourceSource } from './data';
import { Brand, Icon } from './icons';
import { Landscape } from './Landscape';
import { JavaSettings } from './pages/Settings';
import type { Overlay } from './state';
import { useApp } from './state';
import {
  Action,
  Check,
  Choice,
  Dialog,
  Empty,
  Field,
  Notice,
  Search,
  Segments,
  Tag,
  Tile,
  Toggle,
} from './ui';

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
export function Overlays() {
  const a = useApp();
  const [displayed, setDisplayed] = useState({ overlay: a.overlay, revision: 0 });
  if (a.overlay && a.overlay !== displayed.overlay)
    setDisplayed({ overlay: a.overlay, revision: displayed.revision + 1 });
  return <OverlayContent key={displayed.revision} overlay={displayed.overlay} />;
}
function OverlayContent({ overlay: o }: { overlay: Overlay }) {
  const a = useApp();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (!o) return null;
  if (o.type === 'create') return <CreateDialog />;
  if (o.type === 'account') return <AccountDialog />;
  if (o.type === 'resource')
    return <ResourceDialog resource={o.resource} instanceId={o.instanceId} />;
  if (o.type === 'plugin') return <PluginDialog id={o.pluginId} />;
  if (o.type === 'background') return <BackgroundDialog />;
  if (o.type === 'local-plugin') return <LocalPluginDialog />;
  if (o.type === 'import') return <ImportDialog />;
  if (o.type === 'wizard') return <WizardDialog />;
  if (o.type === 'search') return <SearchDialog />;
  if (o.type === 'confirm')
    return (
      <Dialog
        open={a.overlay !== null}
        onClose={() => a.setOverlay(null)}
        title={o.title}
        footer={
          <>
            <Action variant="secondary" onPress={() => a.setOverlay(null)}>
              取消
            </Action>
            <Action
              variant="danger"
              isPending={pending}
              onPress={() => {
                setPending(true);
                Promise.resolve(o.action())
                  .then(() => a.setOverlay(null))
                  .catch((e) => setError(message(e)))
                  .finally(() => setPending(false));
              }}
            >
              确认
            </Action>
          </>
        }
      >
        <div className="confirm-content">
          <Tile icon="alert" color="amber" />
          <p>{o.detail}</p>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
      </Dialog>
    );
  return null;
}
function Steps({ items, step }: { items: string[]; step: number }) {
  return (
    <div className="steps">
      {items.map((v, i) => (
        <div key={v} className={i <= step ? 'active' : ''}>
          <span>{i < step ? <Icon name="check" size={13} /> : i + 1}</span>
          {v}
        </div>
      ))}
    </div>
  );
}

function CreateDialog() {
  const a = useApp();
  const loaderOptions = a.providers.find(
    (p) => p.kind === 'game' && p.id === a.settings.providers.game,
  )?.capabilities ?? ['Vanilla'];
  const [step, setStep] = useState(0);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [version, setVersion] = useState('');
  const [loader, setLoader] = useState<Loader>('Vanilla');
  const [loaderVersions, setLoaderVersions] = useState<VersionEntry[]>([]);
  const [loaderVersion, setLoaderVersion] = useState('');
  const [name, setName] = useState('');
  const [snapshots, setSnapshots] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loaderLoading, setLoaderLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    window.nixel
      .invoke<VersionEntry[]>('game.versions')
      .then((v) => {
        if (active) {
          setVersions(v);
          setVersion(v.find((x) => x.type === 'release')?.id ?? v[0]?.id ?? '');
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (loader === 'Vanilla') {
      setLoaderVersions([]);
      setLoaderVersion('');
      setLoaderLoading(false);
      return;
    }
    let active = true;
    setLoaderLoading(true);
    setLoaderVersion('');
    setError('');
    window.nixel
      .invoke<VersionEntry[]>('game.loaders', { version, loader })
      .then((v) => {
        if (active) {
          setLoaderVersions(v);
          setLoaderVersion(v[0]?.id ?? '');
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setLoaderLoading(false);
      });
    return () => {
      active = false;
    };
  }, [version, loader]);
  const submit = async () => {
    setPending(true);
    setError('');
    try {
      const result = await window.nixel.invoke<{ instanceId: string }>('instances.create', {
        name: name.trim(),
        version,
        loader,
        loaderVersion: loaderVersion || undefined,
        install: true,
      });
      a.openInstance(result.instanceId);
      a.setOverlay(null);
      a.setTaskOpen(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setPending(false);
    }
  };
  const shown = versions.filter((v) => (snapshots || v.type === 'release') && v.id.includes(query));
  return (
    <Dialog
      wide
      open={a.overlay !== null}
      onClose={() => a.setOverlay(null)}
      title="创建实例"
      description="选择游戏版本与加载器，安装到独立目录。"
      footer={
        <>
          <span className="dialog-footer-note">{step + 1} / 3</span>
          <Action
            variant="secondary"
            onPress={() => (step ? setStep(step - 1) : a.setOverlay(null))}
          >
            {step ? '上一步' : '取消'}
          </Action>
          <Action
            icon={step === 2 ? 'download' : 'arrow'}
            isPending={pending}
            isDisabled={
              loading ||
              loaderLoading ||
              !version ||
              (step >= 1 && loader !== 'Vanilla' && !loaderVersion) ||
              (step === 2 && !name.trim())
            }
            onPress={() => (step === 2 ? void submit() : setStep(step + 1))}
          >
            {step === 2 ? '创建并安装' : '下一步'}
          </Action>
        </>
      }
    >
      <Steps items={['游戏版本', '加载器', '实例设置']} step={step} />
      {error && <Notice tone="danger">{error}</Notice>}
      {step === 0 && (
        <div className="stack">
          <div className="row">
            <Search value={query} onChange={setQuery} placeholder="查找 Minecraft 版本" />
            <Check label="显示快照" value={snapshots} onChange={setSnapshots} />
          </div>
          {loading ? (
            <p className="muted">正在获取 Minecraft 版本…</p>
          ) : (
            <div className="option-list version-options">
              {shown.map((v) => (
                <button
                  type="button"
                  key={v.id}
                  className={`select-option ${version === v.id ? 'selected' : ''}`}
                  onClick={() => setVersion(v.id)}
                >
                  <Tile icon="box" size="sm" />
                  <span>
                    <strong>Minecraft {v.id}</strong>
                    <small>{v.type === 'release' ? '正式版' : v.type}</small>
                  </span>
                  {version === v.id && <Icon name="check" size={18} />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {step === 1 && (
        <div className="stack">
          <Segments
            value={loader}
            options={loaderOptions}
            onChange={(v) => setLoader(v as Loader)}
            label="加载器"
          />
          {loader === 'Vanilla' ? (
            <Notice>使用原版 Minecraft，无需额外加载器。</Notice>
          ) : loaderLoading ? (
            <p className="muted">正在获取 {loader} 版本…</p>
          ) : loaderVersions.length ? (
            <Choice
              label="加载器版本"
              value={loaderVersion}
              onChange={setLoaderVersion}
              options={loaderVersions.map((v) => ({ id: v.id, name: v.id }))}
            />
          ) : (
            <Notice tone="warning">
              没有找到适用于 Minecraft {version} 的 {loader} 版本。选择其他加载器或游戏版本。
            </Notice>
          )}
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <Field
            label="实例名称"
            value={name}
            onChange={setName}
            placeholder="给你的新世界起个名字"
          />
          <div className="row">
            <Tag>Minecraft {version}</Tag>
            <Tag>
              {loader}
              {loaderVersion ? ` ${loaderVersion}` : ''}
            </Tag>
          </div>
          <p className="muted">
            实例使用全局服务与游戏设置，创建后可单独调整。安装进度会显示在任务中心。
          </p>
        </div>
      )}
    </Dialog>
  );
}

function AccountDialog() {
  const a = useApp();
  const [type, setType] = useState('Microsoft');
  const [name, setName] = useState('');
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [device, setDevice] = useState<DeviceLogin | null>(null);
  const visible = a.overlay?.type === 'account';
  useEffect(() => {
    if (!device || !visible || type !== 'Microsoft') return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (Date.now() > device.expiresAt) {
        if (active) {
          setError('设备代码已过期，请重新获取。');
          setDevice(null);
        }
        return;
      }
      try {
        const result = await window.nixel.invoke<{ status: 'pending' | 'complete' }>(
          'accounts.microsoft.poll',
          { id: device.id },
        );
        if (!active) return;
        if (result.status === 'complete') {
          a.setOverlay(null);
          return;
        }
        timer = setTimeout(() => void poll(), device.interval * 1000);
      } catch (e) {
        if (active) {
          setError(message(e));
          setDevice(null);
        }
      }
    };
    timer = setTimeout(() => void poll(), device.interval * 1000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [device, visible, type, a.setOverlay]);
  const submit = async () => {
    setPending(true);
    setError('');
    try {
      if (type === 'Microsoft') {
        const result = await window.nixel.invoke<DeviceLogin>('accounts.microsoft.start');
        setDevice(result);
        await window.nixel.openExternal(result.verificationUri);
      } else {
        await window.nixel.invoke(
          type === '离线' ? 'accounts.addOffline' : 'accounts.yggdrasil.login',
          type === '离线' ? { name: name.trim() } : { server, username, password },
        );
        a.setOverlay(null);
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setPending(false);
    }
  };
  const disabled =
    type === 'Microsoft'
      ? false
      : type === '离线'
        ? !/^[A-Za-z0-9_]{1,16}$/.test(name)
        : !server || !username || !password;
  return (
    <Dialog
      open={a.overlay !== null}
      onClose={() => a.setOverlay(null)}
      title="添加账号"
      footer={
        <>
          <Action variant="secondary" onPress={() => a.setOverlay(null)}>
            取消
          </Action>
          <Action
            isPending={pending}
            isDisabled={disabled || Boolean(device)}
            icon={type === 'Microsoft' ? 'arrow' : 'plus'}
            onPress={() => void submit()}
          >
            {type === 'Microsoft' ? '获取设备代码' : '添加账号'}
          </Action>
        </>
      }
    >
      <div className="stack">
        <Segments
          value={type}
          options={['Microsoft', '离线', '第三方']}
          onChange={setType}
          label="账号类型"
        />
        {type === 'Microsoft' &&
          (device ? (
            <div className="auth-preview">
              <div className="microsoft-logo">
                <i />
                <i />
                <i />
                <i />
              </div>
              <p>在浏览器登录 Microsoft 并输入设备代码。</p>
              <strong className="auth-code">{device.userCode}</strong>
              <div className="row">
                <Action
                  size="sm"
                  variant="secondary"
                  icon="copy"
                  onPress={() => void navigator.clipboard.writeText(device.userCode)}
                >
                  复制代码
                </Action>
                <Action
                  size="sm"
                  variant="secondary"
                  onPress={() => void window.nixel.openExternal(device.verificationUri)}
                >
                  打开登录页面
                </Action>
              </div>
              <p className="muted">等待授权完成…</p>
            </div>
          ) : (
            <Notice>登录将在你的浏览器完成。Nixel 仅保存 Minecraft 所需的身份凭据。</Notice>
          ))}
        {type === '离线' && (
          <>
            <Field
              label="角色名称"
              value={name}
              onChange={setName}
              placeholder="Player"
              description="1–16 个英文字母、数字或下划线。"
            />
            <Notice>离线角色用于本地游戏与支持离线身份的服务器。</Notice>
          </>
        )}
        {type === '第三方' && (
          <>
            <Field
              label="Yggdrasil 认证服务器"
              type="url"
              value={server}
              onChange={setServer}
              placeholder="https://example.com/api/yggdrasil"
            />
            <Field label="用户名或邮箱" value={username} onChange={setUsername} />
            <Field label="密码" type="password" value={password} onChange={setPassword} />
          </>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Dialog>
  );
}

function ResourceDialog({ resource: r, instanceId }: { resource: Resource; instanceId?: string }) {
  const a = useApp();
  const isPack = r.category === '整合包';
  const [target, setTarget] = useState(
    instanceId ?? a.launchInstance?.id ?? a.instances[0]?.id ?? '',
  );
  const versionTarget = isPack ? undefined : target;
  const targetInstance = a.instances.find((instance) => instance.id === versionTarget);
  const sourceName =
    a.providers.find((provider) => provider.kind === 'resources' && provider.id === r.source)
      ?.name ?? r.source;
  const [versions, setVersions] = useState<ResourceVersion[]>([]);
  const [version, setVersion] = useState('');
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const installTask = a.tasks.find(
    (task) =>
      task.resourceId === r.id &&
      resourceSource(task.resourceSource) === resourceSource(r.source) &&
      (isPack || task.instanceId === versionTarget) &&
      task.status === 'running',
  );
  const installed = a.content.find(
    (content) =>
      content.instance === versionTarget &&
      (content.projectId ?? content.id) === r.id &&
      resourceSource(content.source) === resourceSource(r.source),
  );
  const selectedVersion = versions.find((item) => item.id === version);
  const alreadyInstalled =
    !isPack &&
    Boolean(
      installed &&
        (installed.versionId === version || installed.version === selectedVersion?.version),
    );
  useEffect(() => {
    if (!isPack && !versionTarget) return;
    let active = true;
    setLoading(true);
    setVersion('');
    setError('');
    window.nixel
      .invoke<ResourceVersion[]>('resources.versions', {
        projectId: r.id,
        instanceId: versionTarget,
        source: r.source,
      })
      .then((v) => {
        if (active) {
          setVersions(v);
          setVersion(v[0]?.id ?? '');
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [r.id, r.source, versionTarget, isPack]);
  const install = async () => {
    setPending(true);
    setError('');
    try {
      await window.nixel.invoke('resources.install', {
        projectId: r.id,
        versionId: version,
        instanceId: versionTarget,
        source: r.source,
      });
      a.setOverlay(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      wide
      open={a.overlay !== null}
      onClose={() => a.setOverlay(null)}
      title={r.name}
      description={`${r.author} · ${sourceName}`}
      footer={
        <>
          <Action variant="secondary" onPress={() => a.setOverlay(null)}>
            取消
          </Action>
          <Action
            icon="download"
            isPending={pending}
            isDisabled={
              (!isPack && !targetInstance) ||
              !version ||
              loading ||
              Boolean(installTask) ||
              alreadyInstalled
            }
            onPress={() => void install()}
          >
            {installTask
              ? `正在安装 ${Math.round(installTask.progress)}%`
              : alreadyInstalled
                ? '已安装'
                : isPack
                  ? '创建整合包实例'
                  : '安装到实例'}
          </Action>
        </>
      }
    >
      <div className="stack">
        <p>{r.desc}</p>
        <div className="row">
          <Tag>{r.category}</Tag>
          <span className="muted">{r.downloads} 次下载</span>
          {r.url && (
            <Action
              size="sm"
              variant="ghost"
              icon="external"
              onPress={() => void window.nixel.openExternal(r.url ?? '')}
            >
              查看项目
            </Action>
          )}
        </div>
        {isPack || a.instances.length ? (
          <>
            {!isPack && instanceId && (
              <div className="install-target-summary">
                安装到 <strong>{targetInstance?.name ?? '实例已移除'}</strong>
                {targetInstance && (
                  <span className="muted">
                    {targetInstance.version} · {targetInstance.loader}
                  </span>
                )}
              </div>
            )}
            {!isPack && !instanceId && (
              <Choice
                label="安装目标"
                value={target}
                onChange={setTarget}
                options={a.instances.map((i) => ({
                  id: i.id,
                  name: `${i.name} · ${i.version} · ${i.loader}`,
                }))}
              />
            )}
            {loading ? (
              <p className="muted">正在获取兼容版本…</p>
            ) : versions.length ? (
              <Choice
                label="资源版本"
                value={version}
                onChange={setVersion}
                options={versions.map((v) => ({
                  id: v.id,
                  name: `${v.version} · ${new Date(v.publishedAt).toLocaleDateString()}`,
                }))}
              />
            ) : (
              <Notice tone="warning">
                {isPack ? '没有可安装的整合包版本。' : '没有适用于当前实例版本与加载器的资源版本。'}
              </Notice>
            )}
          </>
        ) : (
          <Empty title="先创建一个实例" detail="选择游戏版本与加载器后，就可以安装兼容的内容。">
            <Action onPress={() => a.setOverlay({ type: 'create' })}>创建实例</Action>
          </Empty>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Dialog>
  );
}

function PluginDialog({ id }: { id: string }) {
  const a = useApp();
  const p = a.plugins.find((x) => x.id === id);
  const [config, setConfig] = useState(JSON.stringify(p?.config ?? {}, null, 2));
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  if (!p) return null;
  const save = async () => {
    setPending(true);
    setError('');
    try {
      const parsed: unknown = JSON.parse(config);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('配置需要是 JSON 对象。');
      await window.nixel.invoke('plugins.configure', { id, config: parsed });
      a.setOverlay(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      wide
      open={a.overlay !== null}
      onClose={() => a.setOverlay(null)}
      title={p.name}
      description={`${p.id} · v${p.version}`}
      footer={
        <>
          <Action variant="secondary" onPress={() => a.setOverlay(null)}>
            关闭
          </Action>
          <Action isPending={pending} onPress={() => void save()}>
            保存配置
          </Action>
        </>
      }
    >
      <div className="stack">
        <p>{p.desc}</p>
        <div className="row">
          <Tag
            color={p.status === 'active' ? 'success' : p.status === 'error' ? 'danger' : 'default'}
          >
            {p.status === 'active' ? '正在运行' : p.status === 'error' ? '加载失败' : '已停用'}
          </Tag>
          <Tag>{p.category}</Tag>
          <span className="flex-1" />
          <Toggle
            label={`启用 ${p.name}`}
            value={p.enabled}
            disabled={p.id === a.settings.interfacePlugin}
            onChange={(enabled) => void a.command('plugins.setEnabled', { id, enabled })}
          />
        </div>
        {p.error && <Notice tone="danger">{p.error}</Notice>}
        <label htmlFor="plugin-config">插件配置（JSON）</label>
        <textarea
          id="plugin-config"
          className="json-editor"
          value={config}
          onChange={(e) => setConfig(e.target.value)}
        />
        {error && <Notice tone="danger">{error}</Notice>}
        {p.directory && (
          <Action
            variant="secondary"
            icon="folder"
            onPress={() => void window.nixel.openPath(p.directory ?? '')}
          >
            打开插件目录
          </Action>
        )}
        {!p.builtin && (
          <Action
            variant="danger-soft"
            icon="trash"
            onPress={() =>
              a.setOverlay({
                type: 'confirm',
                title: `移除插件 ${p.name}？`,
                detail: '将从启动器卸载插件，保留原始插件目录。',
                action: () => window.nixel.invoke('plugins.remove', { id }),
              })
            }
          >
            卸载插件
          </Action>
        )}
      </div>
    </Dialog>
  );
}

function LocalPluginDialog() {
  const a = useApp();
  const [path, setPath] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const install = async () => {
    setPending(true);
    setError('');
    try {
      await window.nixel.invoke('plugins.install', { directory: path });
      a.setOverlay(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      open={a.overlay !== null}
      onClose={() => a.setOverlay(null)}
      title="安装本地插件"
      footer={
        <>
          <Action variant="secondary" onPress={() => a.setOverlay(null)}>
            取消
          </Action>
          <Action isPending={pending} isDisabled={!path} onPress={() => void install()}>
            安装插件
          </Action>
        </>
      }
    >
      <div className="stack">
        <Notice>选择包含 nixel-plugin.json 的可信插件目录。插件将在本机 Host 进程执行。</Notice>
        <Field label="插件目录" value={path} onChange={setPath} />
        <Action
          variant="secondary"
          icon="folder"
          onPress={() =>
            void window.nixel
              .selectPath({ kind: 'directory', title: '选择 Nixel 插件目录' })
              .then((p) => {
                if (p) setPath(p);
              })
          }
        >
          浏览目录
        </Action>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Dialog>
  );
}

function ImportDialog() {
  const a = useApp();
  const [mode, setMode] = useState('整合包');
  const [versionId, setVersionId] = useState('');
  const [versions, setVersions] = useState<
    { versionId: string; version: string; loader: Loader }[]
  >([]);
  const [detecting, setDetecting] = useState(false);
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setPending(true);
    setError('');
    try {
      await window.nixel.invoke(
        mode === '整合包' ? 'instances.import' : 'instances.importDirectory',
        { path, name: name.trim() || undefined, versionId: versionId.trim() || undefined },
      );
      a.setOverlay(null);
      a.setTaskOpen(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      open={a.overlay !== null}
      onClose={() => a.setOverlay(null)}
      title="导入实例"
      footer={
        <>
          <Action variant="secondary" onPress={() => a.setOverlay(null)}>
            取消
          </Action>
          <Action
            icon="download"
            isPending={pending}
            isDisabled={!path || detecting || (mode === '本地目录' && !versionId)}
            onPress={() => void submit()}
          >
            {mode === '整合包' ? '导入并安装' : '复制为新实例'}
          </Action>
        </>
      }
    >
      <div className="stack">
        <Segments
          label="导入方式"
          value={mode}
          options={['整合包', '本地目录']}
          onChange={(value) => {
            if (pending || detecting) return;
            setMode(value);
            setPath('');
            setVersionId('');
            setVersions([]);
            setError('');
          }}
        />
        <div className="file-drop">
          <Tile icon="upload" size="lg" />
          <h3>{path || (mode === '整合包' ? '选择整合包文件' : '选择游戏目录')}</h3>
          <p>
            {mode === '整合包'
              ? '支持 Modrinth .mrpack 和 CurseForge .zip。'
              : '复制已有游戏目录，包括存档、模组和配置。支持 .minecraft 或独立游戏目录。'}
          </p>
          <Action
            variant="secondary"
            icon="folder"
            isDisabled={pending || detecting}
            onPress={() =>
              void window.nixel
                .selectPath({
                  kind: mode === '整合包' ? 'file' : 'directory',
                  title: mode === '整合包' ? '导入整合包' : '选择游戏目录',
                  filters: [
                    { name: 'Modrinth / CurseForge 整合包', extensions: ['mrpack', 'zip'] },
                  ],
                })
                .then(async (p) => {
                  if (!p) return;
                  setPath(p);
                  setError('');
                  setVersionId('');
                  setVersions([]);
                  if (mode !== '本地目录') return;
                  setDetecting(true);
                  try {
                    const found = await window.nixel.invoke<
                      { versionId: string; version: string; loader: Loader }[]
                    >('instances.detectDirectory', { path: p });
                    setVersions(found);
                    if (found.length === 1 && found[0]) setVersionId(found[0].versionId);
                    if (!found.length) setError('目录中没有找到可导入的游戏版本。');
                  } catch (e) {
                    setError(message(e));
                  } finally {
                    setDetecting(false);
                  }
                })
                .catch((e) => setError(message(e)))
            }
          >
            选择路径
          </Action>
        </div>
        <Field
          label="实例名称（可选）"
          value={name}
          onChange={setName}
          placeholder={mode === '整合包' ? '使用整合包名称' : '使用目录名称'}
        />
        {mode === '本地目录' && (
          <Choice
            label={detecting ? '正在检测游戏版本' : '游戏版本'}
            value={versionId}
            onChange={setVersionId}
            options={[
              { id: '', name: detecting ? '检测中…' : '请选择版本' },
              ...versions.map((v) => ({
                id: v.versionId,
                name: `${v.versionId} · ${v.loader} ${v.version}`,
              })),
            ]}
          />
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Dialog>
  );
}

function BackgroundDialog() {
  const a = useApp();
  const [error, setError] = useState('');
  const choose = async () => {
    try {
      const path = await window.nixel.selectPath({
        kind: 'file',
        title: '选择背景图片',
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      });
      if (path) {
        await window.nixel.invoke('settings.update', { background: path });
        a.setOverlay(null);
      }
    } catch (e) {
      setError(message(e));
    }
  };
  return (
    <Dialog open={a.overlay !== null} onClose={() => a.setOverlay(null)} title="更换背景">
      <div className="stack">
        <button
          type="button"
          className="background-preview background-choice"
          onClick={() => {
            a.setBackground('alpine');
            a.setOverlay(null);
          }}
        >
          <Landscape variant="alpine" />
          <span className="background-preview-label">默认山谷</span>
        </button>
        <div className="row">
          <Action icon="image" onPress={() => void choose()}>
            选择本地图片
          </Action>
          <Action
            variant="secondary"
            onPress={() => {
              a.setBackground('none');
              a.setOverlay(null);
            }}
          >
            纯色背景
          </Action>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Dialog>
  );
}

function WizardDialog() {
  const a = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const finish = async () => {
    setPending(true);
    setError('');
    try {
      if (name.trim()) await window.nixel.invoke('accounts.addOffline', { name: name.trim() });
      await window.nixel.invoke('settings.update', { setupComplete: true });
      a.setOverlay(null);
      if (!a.instances.length) a.setOverlay({ type: 'create' });
    } catch (e) {
      setError(message(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      wide
      open={a.overlay !== null}
      onClose={() => a.setOverlay(null)}
      title="欢迎使用 Nixel"
      footer={
        <>
          <span className="dialog-footer-note">{step + 1} / 3</span>
          {step > 0 && (
            <Action variant="secondary" onPress={() => setStep(step - 1)}>
              上一步
            </Action>
          )}
          <Action
            icon={step === 2 ? 'check' : 'arrow'}
            isPending={pending}
            isDisabled={step === 2 && Boolean(name) && !/^[A-Za-z0-9_]{1,16}$/.test(name)}
            onPress={() => (step === 2 ? void finish() : setStep(step + 1))}
          >
            {step === 2 ? '开始使用' : '下一步'}
          </Action>
        </>
      }
    >
      <Steps items={['欢迎', '偏好与 Java', '游戏账号']} step={step} />
      {step === 0 ? (
        <div className="wizard-content">
          <Brand size={68} />
          <h2>你的世界，自由组合。</h2>
          <p>
            独立实例、本地数据与可组合的插件服务。
            <br />
            先完成几个简单设置，再创建第一个世界。
          </p>
        </div>
      ) : step === 1 ? (
        <div className="stack">
          <Segments
            value={a.theme === 'dark' ? '深色' : a.theme === 'system' ? '跟随系统' : '浅色'}
            options={['浅色', '深色', '跟随系统']}
            onChange={(v) => a.setTheme(v === '深色' ? 'dark' : v === '浅色' ? 'light' : 'system')}
            label="主题"
          />
          <JavaSettings />
        </div>
      ) : (
        <div className="stack">
          <h2>选择一个游戏身份</h2>
          {a.accounts.length ? (
            <Notice>已添加 {a.accounts.length} 个账号，可以直接开始。</Notice>
          ) : (
            <>
              <Field
                label="离线角色名称（可选）"
                value={name}
                onChange={setName}
                placeholder="Player"
                description="1–16 个英文字母、数字或下划线。也可以之后添加 Microsoft 账号。"
              />
              <Notice>你可以随时前往账号页面登录 Microsoft，或添加第三方认证账号。</Notice>
            </>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      )}
    </Dialog>
  );
}

function SearchDialog() {
  const a = useApp();
  const [query, setQuery] = useState('');
  const instances = a.instances.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <Dialog open={a.overlay !== null} onClose={() => a.setOverlay(null)} title="搜索启动器">
      <div className="stack">
        <Search value={query} onChange={setQuery} placeholder="搜索实例或页面" />
        {instances.map((i) => (
          <Action
            key={i.id}
            variant="ghost"
            icon="box"
            onPress={() => {
              a.openInstance(i.id);
              a.setOverlay(null);
            }}
          >
            {i.name} · {i.version}
          </Action>
        ))}
        {(
          [
            { id: 'resources', name: '资源' },
            { id: 'plugins', name: '插件' },
            { id: 'accounts', name: '账号' },
            { id: 'settings', name: '设置' },
          ] as const
        )
          .filter((p) => !query || p.name.includes(query))
          .map((p) => (
            <Action
              key={p.id}
              variant="ghost"
              icon="arrow"
              onPress={() => {
                a.setPage(p.id);
                a.setOverlay(null);
              }}
            >
              {p.name}
            </Action>
          ))}
      </div>
    </Dialog>
  );
}

export function TaskDrawer() {
  const a = useApp();
  const [tab, setTab] = useState('全部');
  const [log, setLog] = useState('');
  const tasks = a.tasks.filter(
    (t) =>
      tab === '全部' ||
      (tab === '进行中'
        ? t.status === 'running'
        : tab === '已完成'
          ? t.status === 'completed'
          : t.status === 'failed' || t.status === 'cancelled'),
  );
  return (
    <Drawer.Backdrop isOpen={a.taskOpen} onOpenChange={a.setTaskOpen}>
      <Drawer.Content placement="right">
        <Drawer.Dialog className="task-drawer">
          <Drawer.CloseTrigger aria-label="关闭任务中心" />
          <Drawer.Header>
            <Drawer.Heading>任务中心</Drawer.Heading>
            <p className="muted">切换页面，进度也会继续。</p>
          </Drawer.Header>
          <Drawer.Body>
            <Segments
              value={tab}
              options={['全部', '进行中', '已完成', '其他']}
              onChange={setTab}
            />
            <div className="task-list">
              {tasks.length ? (
                tasks.map((t) => (
                  <article className="task-card" key={t.id}>
                    <div className="row">
                      <Tile
                        icon={
                          t.status === 'completed'
                            ? 'check'
                            : t.status === 'failed'
                              ? 'alert'
                              : 'download'
                        }
                        size="sm"
                      />
                      <div className="flex-1">
                        <h3>{t.name}</h3>
                        <p>{t.detail}</p>
                      </div>
                      <Tag
                        color={
                          t.status === 'completed'
                            ? 'success'
                            : t.status === 'failed'
                              ? 'danger'
                              : 'default'
                        }
                      >
                        {
                          (
                            {
                              running: '进行中',
                              completed: '已完成',
                              failed: '失败',
                              cancelled: '已取消',
                            } as const
                          )[t.status]
                        }
                      </Tag>
                    </div>
                    <div
                      className={`progress-track ${t.status === 'failed' ? 'progress-error' : ''}`}
                      role="progressbar"
                      aria-label={`${t.name}进度`}
                      aria-valuenow={t.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span style={{ width: `${t.progress}%` }} />
                    </div>
                    <div className="row spread micro">
                      <span>{t.error ?? t.detail}</span>
                      <span>{Math.round(t.progress)}%</span>
                    </div>
                    <div className="row spread task-card-actions">
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => setLog(log === t.id ? '' : t.id)}
                      >
                        任务日志
                        <Icon name={log === t.id ? 'down' : 'chevron'} size={13} />
                      </button>
                      {t.status === 'running' ? (
                        <Action size="sm" variant="ghost" onPress={() => a.cancelTask(t.id)}>
                          取消
                        </Action>
                      ) : (
                        (t.status === 'failed' || t.status === 'cancelled') && (
                          <Action
                            size="sm"
                            variant="secondary"
                            icon="refresh"
                            onPress={() => a.retryTask(t)}
                          >
                            重试
                          </Action>
                        )
                      )}
                    </div>
                    {log === t.id && (
                      <pre className="task-log">
                        {t.logs.length ? t.logs.join('\n') : '暂无任务日志。'}
                      </pre>
                    )}
                  </article>
                ))
              ) : (
                <Empty
                  title="这里暂时没有任务"
                  detail="安装游戏或添加资源后，进度会显示在这里。"
                  icon="download"
                />
              )}
            </div>
          </Drawer.Body>
          <Drawer.Footer>
            <span className="micro">
              {a.tasks.filter((t) => t.status === 'running').length} 项任务进行中
            </span>
            <Action variant="ghost" size="sm" onPress={a.clearTasks}>
              清除已结束任务
            </Action>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
