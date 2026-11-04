import { Card } from '@heroui/react';
import { useEffect, useState } from 'react';
import type { ContentUpdateTarget, Instance, InstanceFile } from '../../../shared/contracts';
import { i18n, label, tr } from '../../../shared/i18n';
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
import { AssetIcon, NavList, Workspace } from '../workspace';
import { Backups } from './Backups';
import { LaunchOptions } from './Settings';

export function InstancesPage() {
  const a = useApp();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('mods');
  const [allBackups, setAllBackups] = useState(false);
  const i = a.current;
  const failedGame = a.tasks.find(
    (task) =>
      task.instanceId === i?.id &&
      (task.kind === 'game' || task.kind === 'launch') &&
      task.status === 'failed',
  );
  return (
    <Workspace
      title={tr('App.instances')}
      sidebar={
        <>
          <Search value={query} onChange={setQuery} placeholder={tr('Instances.searchInstances')} />
          <NavList
            label={tr('Instances.gameInstances')}
            value={allBackups ? '' : (i?.id ?? '')}
            onChange={(id) => {
              a.setSelectedId(id);
              setAllBackups(false);
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
        <div className="stack-tight">
          <div className="side-bottom">
            <Action fullWidth icon="plus" onPress={() => a.setOverlay({ type: 'create' })}>
              {tr('Instances.new')}
            </Action>
            <Action
              fullWidth
              variant="secondary"
              icon="upload"
              onPress={() => a.setOverlay({ type: 'import' })}
            >
              {tr('Instances.import')}
            </Action>
          </div>
          <Action
            fullWidth
            variant={allBackups ? 'secondary' : 'ghost'}
            aria-pressed={allBackups}
            icon="clock"
            onPress={() => setAllBackups(true)}
          >
            {tr('backups.allBackups')}
          </Action>
        </div>
      }
    >
      {allBackups ? (
        <section className="workspace-scroll panel-enter">
          <Backups />
        </section>
      ) : !i ? (
        <Empty
          title={tr('Instances.noGameInstancesYet')}
          detail={tr('Instances.startWithAnIndependentInstanceGameFiles')}
        >
          <Action icon="plus" onPress={() => a.setOverlay({ type: 'create' })}>
            {tr('Instances.createFirstInstance')}
          </Action>
        </Empty>
      ) : (
        <section className="instance-detail">
          <div className="instance-title">
            <h1 className="flex-1">{i.name}</h1>
            <IconButton
              icon="folder"
              label={tr('Instances.openInstanceDirectory')}
              onPress={() => void window.nixel.openPath(i.directory)}
            />
            <IconButton
              icon="upload"
              label={tr('modpacks.exportModpack')}
              onPress={() => void exportInstance(i)}
            />
            <LaunchButton instanceId={i.id} size="sm" />
          </div>
          <Segments
            secondary
            value={a.instanceTab}
            options={['overview', 'content', 'saves', 'screenshots', 'backups', 'settings', 'logs']}
            onChange={a.setInstanceTab}
            label={tr('Instances.instanceTabs')}
          />
          <div className="instance-content-body" hidden={a.instanceTab !== 'content'}>
            <div className="content-scope">
              <Choice
                label={tr('Instances.instanceContentType')}
                value={category}
                options={['mods', 'resourcepacks', 'shaders'].map((name) => ({
                  id: name,
                  name: label(name),
                }))}
                onChange={setCategory}
              />
              <Segments
                secondary
                label={tr('Instances.contentAction')}
                value={a.instanceCatalogOpen ? 'browse' : 'installed'}
                options={['installed', 'browse']}
                onChange={(value) => a.setInstanceCatalogOpen(value === 'browse')}
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
            hidden={a.instanceTab === 'content'}
            key={`${i.id}-${a.instanceTab}`}
          >
            {a.instanceTab === 'overview' && (
              <div className="instance-overview">
                <Group title={tr('Instances.runtime')}>
                  <SettingRow title="Minecraft">
                    <span className="mono">{i.version}</span>
                  </SettingRow>
                  <SettingRow title={tr('Instances.modLoader')}>
                    <span>
                      {i.loader}
                      {i.loaderVersion ? ` ${i.loaderVersion}` : ''}
                    </span>
                  </SettingRow>
                  <SettingRow title="Java">
                    <span className="micro mono">
                      {i.javaPath || a.settings.javaPath || tr('Instances.automatic')}
                    </span>
                  </SettingRow>
                  <SettingRow title={tr('Instances.maximumMemory')}>
                    <span>{(i.memory ?? a.memory) / 1024} GB</span>
                  </SettingRow>
                  <SettingRow title={tr('Instances.installationStatus')}>
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
                            ready: label('installed'),
                            'not-installed': tr('Instances.notInstalled'),
                            installing: tr('Instances.installing'),
                            error: tr('Instances.installationFailed'),
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
                        onPress={() => a.setInstanceTab('logs')}
                      >
                        {tr('Instances.viewGameLogsAndCrashReports')}
                      </Action>
                    </div>
                  </Notice>
                )}
                {i.status !== 'ready' && i.status !== 'installing' && (
                  <Action
                    icon="download"
                    onPress={() => void a.command('instances.install', { id: i.id })}
                  >
                    {tr('Instances.installGameFiles')}
                  </Action>
                )}
              </div>
            )}
            {a.instanceTab === 'settings' && <InstanceSettings key={i.id} instance={i} />}
            {a.instanceTab === 'backups' && <Backups instance={i} />}
            {(a.instanceTab === 'saves' || a.instanceTab === 'screenshots') && (
              <InstanceFiles id={i.id} kind={a.instanceTab === 'saves' ? 'saves' : 'screenshots'} />
            )}
            {a.instanceTab === 'logs' && <LogView id={i.id} />}
          </div>
        </section>
      )}
    </Workspace>
  );
  async function exportInstance(instance: Instance) {
    const path = await window.nixel.selectPath({
      kind: 'save',
      title: tr('Instances.exportInstance'),
      defaultPath: `${instance.name}.mrpack`,
      filters: [{ name: tr('Instances.modrinthModpack'), extensions: ['mrpack'] }],
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
  const busy =
    pending ||
    a.running.includes(instance.id) ||
    instance.status === 'installing' ||
    a.tasks.some((task) => task.instanceId === instance.id && task.status === 'running');
  const visible =
    a.host.status === 'ready' &&
    a.page === 'instances' &&
    a.instanceTab === 'content' &&
    !a.instanceCatalogOpen;
  const list = a.content.filter(
    (c) =>
      c.instance === instance.id &&
      c.category === category &&
      c.name.toLowerCase().includes(query.toLowerCase()),
  );
  const availableUpdates = list.flatMap((entry) =>
    entry.update && entry.projectId && entry.source
      ? [
          {
            contentId: entry.id,
            name: entry.name,
            version: entry.update.version,
            target: {
              source: resourceSource(entry.source),
              projectId: entry.projectId,
              versionId: entry.update.versionId,
            },
          },
        ]
      : [],
  );
  const updates = [
    ...new Map(
      availableUpdates.map((entry) => [`${entry.target.source}:${entry.target.projectId}`, entry]),
    ).values(),
  ];
  const updateTask = a.tasks.find(
    (task) =>
      task.instanceId === instance.id &&
      (task.kind === 'content-check' || task.kind === 'content-update'),
  );
  const startUpdates = async (targets: ContentUpdateTarget[]) => {
    setPending(true);
    await a.command('content.update', { instanceId: instance.id, updates: targets });
    setPending(false);
  };
  useEffect(() => {
    if (!visible) return;
    void a.command('content.list', { instanceId: instance.id });
  }, [a.command, instance.id, visible]);
  return (
    <>
      <div className="content-toolbar">
        <Search
          value={query}
          onChange={setQuery}
          placeholder={tr('Instances.searchInstalledValue', { value1: label(category) })}
        />
        <Action
          size="sm"
          variant="ghost"
          icon="upload"
          isDisabled={busy}
          onPress={async () => {
            const paths = await window.nixel.selectFiles({
              title: tr('Instances.importLocalValue', { value1: label(category) }),
              filters: [
                { name: label(category), extensions: category === 'mods' ? ['jar'] : ['zip'] },
              ],
            });
            if (paths.length) {
              setPending(true);
              await a.command('content.import', {
                instanceId: instance.id,
                category,
                paths,
              });
              a.setTaskOpen(true);
              setPending(false);
            }
          }}
        >
          {tr('Instances.importFiles')}
        </Action>
        <Action
          size="sm"
          variant="ghost"
          icon="refresh"
          isDisabled={busy}
          onPress={async () => {
            setPending(true);
            await a.command('content.checkUpdates', { instanceId: instance.id });
            setPending(false);
          }}
        >
          {tr('Instances.checkForUpdates')}
        </Action>
        <Action
          size="sm"
          variant="ghost"
          icon="folder"
          onPress={() =>
            void window.nixel.openPath(
              `${instance.directory}/${category === 'mods' ? 'mods' : category === 'resourcepacks' ? 'resourcepacks' : 'shaderpacks'}`,
            )
          }
        >
          {tr('Instances.directory')}
        </Action>
      </div>
      {(updateTask || updates.length > 1) && (
        <div className="content-update-status">
          <span role="status" className={updateTask?.status === 'failed' ? 'text-danger' : 'muted'}>
            {updateTask &&
              (updateTask.status === 'failed'
                ? tr('content.taskFailed')
                : updateTask.status === 'cancelled'
                  ? tr('overlays.cancelled')
                  : updateTask.detail)}
            {updateTask?.status === 'running' && ` · ${Math.round(updateTask.progress)}%`}
          </span>
          <div className="row">
            {updateTask?.status === 'running' && (
              <Action size="sm" variant="ghost" onPress={() => a.cancelTask(updateTask.id)}>
                {tr('overlays.cancel')}
              </Action>
            )}
            {updateTask && (
              <Action size="sm" variant="ghost" onPress={() => a.setTaskOpen(true)}>
                {tr('content.taskDetails')}
              </Action>
            )}
            {updates.length > 1 && (
              <Action
                size="sm"
                variant="secondary"
                icon="refresh"
                isDisabled={busy}
                onPress={() =>
                  a.setOverlay({
                    type: 'confirm',
                    title: tr('content.updateVisible', { count: updates.length }),
                    detail: tr('content.confirmUpdates', {
                      names: new Intl.ListFormat(i18n.language).format(
                        updates.map((entry) => `${entry.name} → ${entry.version}`),
                      ),
                    }),
                    action: async () => {
                      await window.nixel.invoke('content.update', {
                        instanceId: instance.id,
                        updates: updates.map((entry) => entry.target),
                      });
                    },
                  })
                }
              >
                {tr('content.updateVisible', { count: updates.length })}
              </Action>
            )}
          </div>
        </div>
      )}
      <div className="workspace-scroll">
        {list.length ? (
          <Card className="content-table">
            {list.map((c) => {
              const update = availableUpdates.find((entry) => entry.contentId === c.id);
              const task = a.tasks.find(
                (entry) =>
                  entry.instanceId === instance.id &&
                  entry.resourceId === (c.projectId ?? c.id) &&
                  resourceSource(entry.resourceSource) === resourceSource(c.source) &&
                  entry.status === 'running',
              );
              return (
                <div className="content-row" key={c.id}>
                  <AssetIcon src={c.icon} kind={c.category} size="sm" />
                  <div className="flex-1">
                    <strong>{c.name}</strong>
                    <small>
                      {c.fileName} · {c.version || tr('resources.localFile')}
                    </small>
                    {c.update && (
                      <Tag color="accent">
                        {tr('Instances.updateAvailable')}
                        {c.update.version}
                      </Tag>
                    )}
                  </div>
                  {(update || task) && c.projectId && (
                    <Action
                      size="sm"
                      variant="secondary"
                      icon="refresh"
                      isDisabled={busy || Boolean(task)}
                      onPress={() => {
                        if (update) void startUpdates([update.target]);
                      }}
                    >
                      {task
                        ? tr('Instances.updatingValue', { value1: Math.round(task.progress) })
                        : tr('Instances.update')}
                    </Action>
                  )}
                  <Toggle
                    label={tr('overlays.enableValue', { value1: c.name })}
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
                    label={tr('Instances.removeValue', { value1: c.name })}
                    isDisabled={busy || Boolean(task)}
                    onPress={() =>
                      a.setOverlay({
                        type: 'confirm',
                        title: tr('Instances.removeValue2', { value1: c.name }),
                        detail: tr('Instances.deleteThisContentFileFromTheCurrent'),
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
            title={tr('Instances.noValueYet', { value1: label(category) })}
            detail={tr('Instances.addContentHint')}
          >
            <Action icon="plus" onPress={() => a.setInstanceCatalogOpen(true)}>
              {tr('Instances.addContent')}
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
      <Group title={tr('Instances.instanceConfiguration')}>
        <SettingRow title={tr('overlays.instanceName')}>
          <Field hideLabel label={tr('Instances.name')} value={name} onChange={setName} />
        </SettingRow>
        <SettingRow
          title={tr('Instances.defaultAccount')}
          description={tr('Instances.accountPriority')}
        >
          <Choice
            label={tr('Instances.defaultAccount')}
            value={account}
            onChange={setAccount}
            options={[
              { id: '', name: tr('Instances.useGlobalDefault') },
              ...a.accounts.map((p) => ({ id: p.id, name: p.name })),
            ]}
          />
        </SettingRow>
        <SettingRow title={tr('Instances.useGlobalMemoryLimit')}>
          <Toggle
            label={tr('Instances.useGlobalMemoryLimit')}
            value={inherit}
            onChange={setInherit}
          />
        </SettingRow>
        {!inherit && (
          <div className="padded">
            <Range
              label={tr('Instances.memoryLimit')}
              value={memory / 1024}
              onChange={(value) => setMemory(value * 1024)}
              min={1}
              max={32}
              suffix=" GB"
            />
          </div>
        )}
        <SettingRow
          title={tr('Instances.javaPath')}
          description={tr('Instances.leaveEmptyToUseGlobalSettings')}
        >
          <div className="row">
            <Field
              hideLabel
              label={tr('Instances.javaExecutable')}
              value={javaPath}
              onChange={setJavaPath}
            />
            <IconButton
              icon="folder"
              label={tr('Instances.chooseJava')}
              onPress={() =>
                void window.nixel
                  .selectPath({ kind: 'file', title: tr('Instances.chooseJavaExecutable') })
                  .then((path) => {
                    if (path) setJavaPath(path);
                  })
              }
            />
          </div>
        </SettingRow>
      </Group>

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
          {tr('Instances.saveInstanceSettings')}
        </Action>
      </div>
      <LaunchOptions instanceId={i.id} />
      <InstanceProviders instance={i} busy={busy} />
      <details className="advanced-settings instance-maintenance">
        <summary>{tr('Instances.maintenance')}</summary>
        <div className="row">
          <Action
            variant="danger-soft"
            icon="trash"
            isDisabled={busy}
            onPress={() =>
              a.setOverlay({
                type: 'confirm',
                title: tr('Instances.deleteInstanceValue', { value1: i.name }),
                detail: tr('Instances.deleteTheInstanceAndItsEntireDirectory'),
                action: () =>
                  window.nixel.invoke('instances.delete', { id: i.id, deleteFiles: true }),
              })
            }
          >
            {tr('Instances.deleteInstance')}
          </Action>
          <Action
            variant="secondary"
            icon="copy"
            isDisabled={busy}
            onPress={async () => {
              await run('instances.clone', { id: i.id }, true);
            }}
          >
            {tr('Instances.cloneInstance')}
          </Action>
          <Action
            variant="secondary"
            icon="refresh"
            isDisabled={busy}
            onPress={async () => {
              await run('instances.install', { id: i.id }, true);
            }}
          >
            {tr('Instances.verifyAndRepair')}
          </Action>
        </div>
      </details>
    </div>
  );
}

function InstanceProviders({ instance, busy }: { instance: Instance; busy: boolean }) {
  const a = useApp();
  const [saving, setSaving] = useState(false);
  const services = [
    { kind: 'game', name: tr('builtin.minecraftGameService') },
    { kind: 'resources', name: tr('ResourceBrowser.resourceSource') },
    { kind: 'accounts', name: tr('launch.accountService') },
  ] as const;
  return (
    <details className="advanced-settings">
      <summary>{tr('launch.servicePlugins')}</summary>
      <div className="stack">
        {services.map(({ kind, name }) => {
          const current = instance.providers[kind];
          const options = a.providers
            .filter((provider) => provider.kind === kind)
            .map((provider) => ({ id: provider.id, name: provider.name }));
          if (kind === 'accounts') options.unshift({ id: '', name: tr('launch.followAccount') });
          if (current && !options.some((option) => option.id === current))
            options.push({
              id: current,
              name: tr('launch.providerUnavailable', { name: current }),
            });
          return (
            <SettingRow key={kind} title={name}>
              <Choice
                label={name}
                value={current}
                options={options}
                isDisabled={busy || saving}
                onChange={async (value) => {
                  setSaving(true);
                  await a.command('instances.update', {
                    id: instance.id,
                    patch: { providers: { [kind]: value } },
                  });
                  setSaving(false);
                }}
              />
            </SettingRow>
          );
        })}
      </div>
    </details>
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
        title={
          kind === 'saves'
            ? tr('Instances.worldSaves')
            : kind === 'screenshots'
              ? tr('Instances.screenshots')
              : tr('Instances.crashReports')
        }
      >
        <Action
          icon="folder"
          variant="secondary"
          size="sm"
          onPress={() => {
            if (i) void window.nixel.openPath(`${i.directory}/${kind}`);
          }}
        >
          {tr('Instances.openDirectory')}
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
                  {tr('Instances.open')}
                </Action>
              </div>
              <p className="micro">{new Date(f.modifiedAt).toLocaleString(i18n.language)}</p>
            </Card>
          ))}
        </div>
      ) : (
        <Empty
          title={
            kind === 'saves'
              ? tr('Instances.noWorldSavesYet')
              : kind === 'screenshots'
                ? tr('Instances.noScreenshotsYet')
                : tr('Instances.noCrashReports')
          }
          detail={
            kind === 'saves'
              ? tr('Instances.worldsYouCreateInTheGameWill')
              : kind === 'screenshots'
                ? tr('Instances.pressF2InTheGameToSave')
                : tr('Instances.crashReportsGeneratedByTheGameWill')
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
  const visible = a.page === 'instances' && a.instanceTab === 'logs';
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
          {a.running.includes(id)
            ? tr('Instances.gameRunningLogsRefreshEvery2Seconds')
            : tr('Instances.latestGameLog')}
        </span>
        <Action
          size="sm"
          variant="secondary"
          icon="copy"
          onPress={() => void navigator.clipboard.writeText(lines.join('\n'))}
        >
          {tr('Instances.copyLog')}
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
          {tr('Instances.logDirectory')}
        </Action>
        <Action
          size="sm"
          variant="secondary"
          icon="folder"
          onPress={() => {
            if (instance) void window.nixel.openPath(`${instance.directory}/crash-reports`);
          }}
        >
          {tr('Instances.crashReports')}
        </Action>
      </div>
      {error ? (
        <Notice tone="danger">{error}</Notice>
      ) : (
        <pre className="game-log">
          {lines.length ? lines.join('\n') : tr('Instances.noGameLogYetLaunchTheGame')}
        </pre>
      )}
    </div>
  );
}
