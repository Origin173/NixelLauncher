import { Card } from '@heroui/react';
import { useEffect, useState } from 'react';
import type { Instance, InstanceFile, ResourceVersion } from '../../../shared/contracts';
import { resourceSource } from '../data';
import { LaunchButton } from '../LaunchButton';
import { ResourceBrowser } from '../ResourceBrowser';
import { useApp } from '../state';
import {
  Action,
  Choice,
  Empty,
  Field,
  Group,
  Heading,
  IconButton,
  Notice,
  Range,
  Search,
  Segments,
  SettingRow,
  Tag,
  Toggle,
} from '../ui';
import { NavList, PlaceholderIcon, Workspace } from '../workspace';
import { LaunchOptions } from './Settings';

export function InstancesPage() {
  const a = useApp();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('模组');
  const i = a.current;
  const failedGame = a.tasks.find(
    (task) =>
      task.instanceId === i?.id &&
      (task.kind === 'game' || task.kind === 'launch') &&
      task.status === 'failed',
  );
  return (
    <Workspace
      title="实例"
      sidebar={
        <>
          <Search value={query} onChange={setQuery} placeholder="搜索实例" />
          <NavList
            label="游戏实例"
            value={i?.id ?? ''}
            onChange={(id) => {
              a.setSelectedId(id);
              a.setInstanceCatalogOpen(false);
            }}
            items={a.instances
              .filter((x) => x.name.toLowerCase().includes(query.toLowerCase()))
              .map((x) => ({
                id: x.id,
                name: x.name,
                icon: 'box',
                detail: a.running.includes(x.id) ? <span className="status-dot live" /> : null,
              }))}
          />
        </>
      }
      footer={
        <div className="side-bottom">
          <Action fullWidth icon="plus" onPress={() => a.setOverlay({ type: 'create' })}>
            新建
          </Action>
          <Action
            fullWidth
            variant="secondary"
            icon="upload"
            onPress={() => a.setOverlay({ type: 'import' })}
          >
            导入
          </Action>
        </div>
      }
    >
      {!i ? (
        <Empty title="还没有游戏实例" detail="从一个独立实例开始。游戏文件、模组和存档分别保存。">
          <Action icon="plus" onPress={() => a.setOverlay({ type: 'create' })}>
            创建第一个实例
          </Action>
        </Empty>
      ) : (
        <section className="instance-detail">
          <div className="instance-title">
            <h1 className="flex-1">{i.name}</h1>
            <IconButton
              icon="folder"
              label="查看实例目录"
              onPress={() => void window.nixel.openPath(i.directory)}
            />
            <IconButton icon="upload" label="导出整合包" onPress={() => void exportInstance(i)} />
            <LaunchButton instanceId={i.id} size="sm" />
          </div>
          <Segments
            secondary
            value={a.instanceTab}
            options={['概览', '内容', '存档', '截图', '设置', '日志']}
            onChange={a.setInstanceTab}
            label="实例管理分页"
          />
          <div className="instance-content-body" hidden={a.instanceTab !== '内容'}>
            <div className="content-scope">
              <Choice
                label="实例内容类型"
                value={category}
                options={['模组', '资源包', '光影'].map((name) => ({ id: name, name }))}
                onChange={setCategory}
              />
              <Segments
                secondary
                label="内容操作"
                value={a.instanceCatalogOpen ? '添加内容' : '已安装'}
                options={['已安装', '添加内容']}
                onChange={(value) => a.setInstanceCatalogOpen(value === '添加内容')}
              />
            </div>
            <div className="content-pane" hidden={a.instanceCatalogOpen}>
              <InstalledList instance={i} category={category} />
            </div>
            <div className="content-pane content-pane--catalog" hidden={!a.instanceCatalogOpen}>
              <ResourceBrowser category={category} instanceId={i.id} />
            </div>
          </div>
          <div
            className="detail-scroll panel-enter"
            hidden={a.instanceTab === '内容'}
            key={`${i.id}-${a.instanceTab}`}
          >
            {a.instanceTab === '概览' && (
              <div className="instance-overview">
                <Group title="运行环境">
                  <SettingRow title="Minecraft">
                    <span className="mono">{i.version}</span>
                  </SettingRow>
                  <SettingRow title="模组加载器">
                    <span>
                      {i.loader}
                      {i.loaderVersion ? ` ${i.loaderVersion}` : ''}
                    </span>
                  </SettingRow>
                  <SettingRow title="Java">
                    <span className="micro mono">
                      {i.javaPath || a.settings.javaPath || '自动选择'}
                    </span>
                  </SettingRow>
                  <SettingRow title="最大内存">
                    <span>{(i.memory ?? a.memory) / 1024} GB</span>
                  </SettingRow>
                  <SettingRow title="安装状态">
                    <Tag
                      color={
                        i.status === 'ready'
                          ? 'success'
                          : i.status === 'error'
                            ? 'danger'
                            : 'default'
                      }
                    >
                      {
                        (
                          {
                            ready: '已安装',
                            'not-installed': '待安装',
                            installing: '安装中',
                            error: '安装失败',
                          } as const
                        )[i.status]
                      }
                    </Tag>
                  </SettingRow>
                </Group>
                {i.error && <Notice tone="danger">{i.error}</Notice>}
                {failedGame && (
                  <Notice tone="danger">
                    <div className="stack">
                      <span>{failedGame.error || failedGame.detail}</span>
                      <Action
                        size="sm"
                        variant="secondary"
                        onPress={() => a.setInstanceTab('日志')}
                      >
                        查看游戏日志与崩溃报告
                      </Action>
                    </div>
                  </Notice>
                )}
                {i.status !== 'ready' && i.status !== 'installing' && (
                  <Action
                    icon="download"
                    onPress={() => void a.command('instances.install', { id: i.id })}
                  >
                    安装游戏文件
                  </Action>
                )}
              </div>
            )}
            {a.instanceTab === '设置' && <InstanceSettings key={i.id} instance={i} />}
            {(a.instanceTab === '存档' || a.instanceTab === '截图') && (
              <InstanceFiles id={i.id} kind={a.instanceTab === '存档' ? 'saves' : 'screenshots'} />
            )}
            {a.instanceTab === '日志' && <LogView id={i.id} />}
          </div>
        </section>
      )}
    </Workspace>
  );
  async function exportInstance(instance: Instance) {
    const path = await window.nixel.selectPath({
      kind: 'save',
      title: '导出实例',
      defaultPath: `${instance.name}.mrpack`,
      filters: [{ name: 'Modrinth 整合包', extensions: ['mrpack'] }],
    });
    if (path) {
      await a.command('instances.export', { id: instance.id, path });
      a.setTaskOpen(true);
    }
  }
}

function InstalledList({ instance, category }: { instance: Instance; category: string }) {
  const a = useApp();
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const busy = pending || a.running.includes(instance.id) || instance.status === 'installing';
  const providerName =
    a.providers.find((p) => p.id === instance.providers.resources)?.name ?? '资源目录';
  const visible =
    a.host.status === 'ready' &&
    a.page === 'instances' &&
    a.instanceTab === '内容' &&
    !a.instanceCatalogOpen;
  const list = a.content.filter(
    (c) =>
      c.instance === instance.id &&
      c.category === category &&
      c.name.toLowerCase().includes(query.toLowerCase()),
  );
  useEffect(() => {
    if (!visible) return;
    void a.command('content.list', { instanceId: instance.id });
  }, [a.command, instance.id, visible]);
  return (
    <>
      <div className="content-toolbar">
        <Search value={query} onChange={setQuery} placeholder={`搜索已安装${category}`} />
        <Action
          size="sm"
          variant="ghost"
          icon="upload"
          isDisabled={busy}
          onPress={async () => {
            const path = await window.nixel.selectPath({
              kind: 'file',
              title: `导入本地${category}`,
              filters: [{ name: category, extensions: category === '模组' ? ['jar'] : ['zip'] }],
            });
            if (path) {
              setPending(true);
              await a.command('content.import', {
                instanceId: instance.id,
                category,
                paths: [path],
              });
              a.setTaskOpen(true);
              setPending(false);
            }
          }}
        >
          导入文件
        </Action>
        <Action
          size="sm"
          variant="ghost"
          icon="refresh"
          isDisabled={busy}
          onPress={() => void a.command('content.checkUpdates', { instanceId: instance.id })}
        >
          检查更新
        </Action>
        <Action
          size="sm"
          variant="ghost"
          icon="folder"
          onPress={() =>
            void window.nixel.openPath(
              `${instance.directory}/${category === '模组' ? 'mods' : category === '资源包' ? 'resourcepacks' : 'shaderpacks'}`,
            )
          }
        >
          目录
        </Action>
      </div>
      <div className="workspace-scroll">
        {list.length ? (
          <Card className="content-table">
            {list.map((c) => {
              const task = a.tasks.find(
                (entry) =>
                  entry.instanceId === instance.id &&
                  entry.resourceId === (c.projectId ?? c.id) &&
                  resourceSource(entry.resourceSource) === resourceSource(c.source) &&
                  entry.status === 'running',
              );
              return (
                <div className="content-row" key={c.id}>
                  <PlaceholderIcon name={c.name} size="sm" />
                  <div className="flex-1">
                    <strong>{c.name}</strong>
                    <small>
                      {c.fileName} · {c.version}
                    </small>
                    {c.update && <Tag color="accent">可更新至 {c.update}</Tag>}
                  </div>
                  {(c.update || task) && c.projectId && (
                    <Action
                      size="sm"
                      variant="secondary"
                      icon="refresh"
                      isDisabled={busy || Boolean(task)}
                      onPress={async () => {
                        const versions = await a.command<ResourceVersion[]>('resources.versions', {
                          projectId: c.projectId,
                          instanceId: instance.id,
                          source: c.source,
                        });
                        const next = versions?.find((v) => v.version === c.update) ?? versions?.[0];
                        if (next) {
                          await a.command('resources.install', {
                            projectId: c.projectId,
                            versionId: next.id,
                            instanceId: instance.id,
                            source: c.source,
                          });
                        }
                      }}
                    >
                      {task ? `正在更新 ${Math.round(task.progress)}%` : '更新'}
                    </Action>
                  )}
                  <Toggle
                    label={`启用 ${c.name}`}
                    value={c.enabled}
                    disabled={busy || Boolean(task)}
                    onChange={(enabled) =>
                      void a.command('content.setEnabled', {
                        instanceId: instance.id,
                        id: c.id,
                        enabled,
                      })
                    }
                  />
                  <IconButton
                    icon="trash"
                    label={`移除 ${c.name}`}
                    isDisabled={busy || Boolean(task)}
                    onPress={() =>
                      a.setOverlay({
                        type: 'confirm',
                        title: `移除 ${c.name}？`,
                        detail: '将从当前实例删除这个内容文件。',
                        action: () =>
                          window.nixel.invoke('content.remove', {
                            instanceId: instance.id,
                            id: c.id,
                          }),
                      })
                    }
                  />
                </div>
              );
            })}
          </Card>
        ) : (
          <Empty
            title={`还没有${category}`}
            detail={`从 ${providerName} 添加内容，或打开目录放入本地文件。`}
          >
            <Action icon="plus" onPress={() => a.setInstanceCatalogOpen(true)}>
              添加内容
            </Action>
          </Empty>
        )}
      </div>
    </>
  );
}

function InstanceSettings({ instance: i }: { instance: Instance }) {
  const a = useApp();
  const [name, setName] = useState(i.name);
  const [memory, setMemory] = useState(i.memory ?? a.memory);
  const [inherit, setInherit] = useState(i.memory === null);
  const [javaPath, setJavaPath] = useState(i.javaPath);
  const [account, setAccount] = useState(i.account);
  const [pending, setPending] = useState(false);
  const busy =
    pending ||
    a.running.includes(i.id) ||
    i.status === 'installing' ||
    a.tasks.some((task) => task.instanceId === i.id && task.status === 'running');
  const run = async (command: string, params: unknown, task = false) => {
    setPending(true);
    await a.command(command, params);
    if (task) a.setTaskOpen(true);
    setPending(false);
  };
  return (
    <div className="settings-content">
      <Group title="实例配置">
        <SettingRow title="实例名称">
          <Field label="名称" value={name} onChange={setName} />
        </SettingRow>
        <SettingRow title="固定账号" description="留空时使用主页的启动选择与全局默认账号。">
          <Choice
            label="固定账号"
            value={account}
            onChange={setAccount}
            options={[
              { id: '', name: '继承全局默认' },
              ...a.accounts.map((p) => ({ id: p.id, name: p.name })),
            ]}
          />
        </SettingRow>
        <SettingRow title="继承全局内存">
          <Toggle label="继承全局内存" value={inherit} onChange={setInherit} />
        </SettingRow>
        {!inherit && (
          <div className="padded">
            <Range
              label="内存上限"
              value={memory / 1024}
              onChange={(value) => setMemory(value * 1024)}
              min={1}
              max={32}
              suffix=" GB"
            />
          </div>
        )}
        <SettingRow title="Java 路径" description="留空使用全局设置。">
          <div className="row">
            <Field label="Java 可执行文件" value={javaPath} onChange={setJavaPath} />
            <IconButton
              icon="folder"
              label="选择 Java"
              onPress={() =>
                void window.nixel
                  .selectPath({ kind: 'file', title: '选择 Java 可执行文件' })
                  .then((path) => {
                    if (path) setJavaPath(path);
                  })
              }
            />
          </div>
        </SettingRow>
      </Group>
      <LaunchOptions instanceId={i.id} />
      <div className="row">
        <Action
          icon="check"
          isDisabled={!name.trim() || pending}
          onPress={() => {
            void run('instances.update', {
              id: i.id,
              patch: {
                name: name.trim(),
                account,
                memory: inherit ? null : memory,
                javaPath,
              },
            });
          }}
        >
          保存实例设置
        </Action>
        <Action
          variant="danger-soft"
          icon="trash"
          isDisabled={busy}
          onPress={() =>
            a.setOverlay({
              type: 'confirm',
              title: `删除实例 ${i.name}？`,
              detail: '将移除实例记录并删除整个实例目录，包括存档、截图和模组。此操作无法撤销。',
              action: () =>
                window.nixel.invoke('instances.delete', { id: i.id, deleteFiles: true }),
            })
          }
        >
          删除实例
        </Action>
        <Action
          variant="secondary"
          icon="copy"
          isDisabled={busy}
          onPress={async () => {
            await run('instances.clone', { id: i.id }, true);
          }}
        >
          复制实例
        </Action>
        <Action
          variant="secondary"
          icon="refresh"
          isDisabled={busy}
          onPress={async () => {
            await run('instances.install', { id: i.id }, true);
          }}
        >
          校验并修复
        </Action>
      </div>
    </div>
  );
}

function InstanceFiles({
  id,
  kind,
}: {
  id: string;
  kind: 'saves' | 'screenshots' | 'crash-reports';
}) {
  const a = useApp();
  const [files, setFiles] = useState<InstanceFile[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    window.nixel
      .invoke<InstanceFile[]>('instances.files', { id, kind })
      .then(async (result) => {
        if (!active) return;
        setFiles(result);
        if (kind === 'screenshots') {
          const entries = await Promise.all(
            result.map(async (f) => [f.path, await window.nixel.readImage(f.path)] as const),
          );
          if (active) setImages(Object.fromEntries(entries));
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, kind]);
  const i = a.instances.find((x) => x.id === id);
  return (
    <div className="stack">
      <Heading
        title={kind === 'saves' ? '世界存档' : kind === 'screenshots' ? '游戏截图' : '崩溃报告'}
      >
        <Action
          icon="folder"
          variant="secondary"
          size="sm"
          onPress={() => {
            if (i) void window.nixel.openPath(`${i.directory}/${kind}`);
          }}
        >
          打开目录
        </Action>
      </Heading>
      {error ? (
        <Notice tone="danger">{error}</Notice>
      ) : files.length ? (
        <div className={kind === 'screenshots' ? 'screenshot-grid' : 'stack'}>
          {files.map((f) => (
            <Card className="padded" key={f.path}>
              {images[f.path] && (
                <img className="game-screenshot" src={images[f.path]} alt={f.name} />
              )}
              <div className="row">
                <strong className="flex-1">{f.name}</strong>
                <Action
                  size="sm"
                  variant="ghost"
                  onPress={() => void window.nixel.openPath(f.path)}
                >
                  打开
                </Action>
              </div>
              <p className="micro">{new Date(f.modifiedAt).toLocaleString()}</p>
            </Card>
          ))}
        </div>
      ) : (
        <Empty
          title={
            kind === 'saves'
              ? '还没有世界存档'
              : kind === 'screenshots'
                ? '还没有游戏截图'
                : '没有崩溃报告'
          }
          detail={
            kind === 'saves'
              ? '在游戏中创建世界后会显示在这里。'
              : kind === 'screenshots'
                ? '在游戏中按 F2 保存截图。'
                : '游戏生成的崩溃报告会显示在这里。'
          }
        />
      )}
    </div>
  );
}

export function LogView({ id }: { id: string }) {
  const a = useApp();
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState('');
  const failure = a.tasks.find(
    (task) =>
      task.instanceId === id &&
      (task.kind === 'launch' || task.kind === 'game') &&
      task.status === 'failed',
  );
  const instance = a.instances.find((entry) => entry.id === id);
  const visible = a.page === 'instances' && a.instanceTab === '日志';
  useEffect(() => {
    if (!visible) return;
    let active = true;
    const read = () =>
      window.nixel
        .invoke<string[]>('instances.logs', { id })
        .then((result) => {
          if (active) {
            setLines(result);
            setError('');
          }
        })
        .catch((e: Error) => {
          if (active) setError(e.message);
        });
    void read();
    const timer = setInterval(() => void read(), 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, visible]);
  return (
    <div className="stack">
      <InstanceFiles id={id} kind="crash-reports" />
      <div className="row spread">
        <span className="muted">
          {a.running.includes(id) ? '游戏正在运行 · 日志每 2 秒更新' : '最近一次游戏日志'}
        </span>
        <Action
          size="sm"
          variant="secondary"
          icon="copy"
          onPress={() => void navigator.clipboard.writeText(lines.join('\n'))}
        >
          复制日志
        </Action>
      </div>
      {failure && <Notice tone="danger">{failure.error || failure.detail}</Notice>}
      {failure && <pre className="game-log">{failure.logs.join('\n')}</pre>}
      <div className="row">
        <Action
          size="sm"
          variant="secondary"
          icon="folder"
          onPress={() => {
            if (instance) void window.nixel.openPath(`${instance.directory}/logs`);
          }}
        >
          日志目录
        </Action>
        <Action
          size="sm"
          variant="secondary"
          icon="folder"
          onPress={() => {
            if (instance) void window.nixel.openPath(`${instance.directory}/crash-reports`);
          }}
        >
          崩溃报告
        </Action>
      </div>
      {error ? (
        <Notice tone="danger">{error}</Notice>
      ) : (
        <pre className="game-log">
          {lines.length ? lines.join('\n') : '尚无游戏日志。启动游戏后，输出会显示在这里。'}
        </pre>
      )}
    </div>
  );
}
