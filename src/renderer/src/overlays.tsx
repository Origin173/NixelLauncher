import { Drawer } from '@heroui/react';
import { useEffect, useState } from 'react';
import type { Loader, VersionEntry } from '../../shared/contracts';
import { label, tr } from '../../shared/i18n';
import { AccountDialog } from './accounts/AccountDialog';
import { TaskControls } from './downloads/TaskControls';
import { Brand, Icon } from './icons';
import { VersionChangeDialog } from './instances/VersionChangeDialog';
import { Landscape } from './Landscape';
import { JavaSettings } from './pages/Settings';
import { ConfigForm } from './plugins/ConfigForm';
import { ResourceDialog } from './resources/ResourceDialog';
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
import { AssetIcon } from './workspace';

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
  if (o.type === 'version-change') return <VersionChangeDialog instanceId={o.instanceId} />;
  if (o.type === 'account')
    return (
      <AccountDialog instanceId={o.instanceId} accountId={o.accountId} joinServer={o.joinServer} />
    );
  if (o.type === 'launch-account')
    return (
      <LaunchAccountDialog
        instanceId={o.instanceId}
        accountId={o.accountId}
        joinServer={o.joinServer}
      />
    );
  if (o.type === 'resource')
    return <ResourceDialog resource={o.resource} instanceId={o.instanceId} initialTab={o.tab} />;
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
              {tr('overlays.cancel')}
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
              {tr('overlays.confirm')}
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
      title={tr('overlays.createInstance')}
      description={tr('overlays.chooseAGameVersionAndLoaderFor')}
      footer={
        <>
          <span className="dialog-footer-note">{step + 1} / 3</span>
          <Action
            variant="secondary"
            onPress={() => (step ? setStep(step - 1) : a.setOverlay(null))}
          >
            {step ? tr('overlays.back') : tr('overlays.cancel')}
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
            {step === 2 ? tr('overlays.createAndInstall') : tr('overlays.next')}
          </Action>
        </>
      }
    >
      <Steps
        items={[tr('overlays.gameVersion'), tr('overlays.loader'), tr('overlays.instanceSettings')]}
        step={step}
      />
      {error && <Notice tone="danger">{error}</Notice>}
      {step === 0 && (
        <div className="stack">
          <div className="row">
            <Search
              value={query}
              onChange={setQuery}
              placeholder={tr('overlays.findMinecraftVersions')}
            />
            <Check label={tr('overlays.showSnapshots')} value={snapshots} onChange={setSnapshots} />
          </div>
          {loading ? (
            <p className="muted">{tr('overlays.fetchingMinecraftVersions')}</p>
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
                    <small>{v.type === 'release' ? tr('overlays.release') : v.type}</small>
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
            label={tr('overlays.loader')}
          />
          {loader === 'Vanilla' ? (
            <Notice>{tr('overlays.useVanillaMinecraftWithoutAnAdditionalLoader')}</Notice>
          ) : loaderLoading ? (
            <p className="muted">{tr('create.loaderLoading', { loader })}</p>
          ) : loaderVersions.length ? (
            <Choice
              label={tr('overlays.loaderVersion')}
              value={loaderVersion}
              onChange={setLoaderVersion}
              options={loaderVersions.map((v) => ({ id: v.id, name: v.id }))}
            />
          ) : (
            <Notice tone="warning">{tr('create.noLoader', { version, loader })}</Notice>
          )}
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <Field
            label={tr('overlays.instanceName')}
            value={name}
            onChange={setName}
            placeholder={tr('overlays.nameYourNewWorld')}
          />
          <div className="row">
            <Tag>Minecraft {version}</Tag>
            <Tag>
              {loader}
              {loaderVersion ? ` ${loaderVersion}` : ''}
            </Tag>
          </div>
          <p className="muted">{tr('overlays.newInstancesUseGlobalGameSettingsYou')}</p>
        </div>
      )}
    </Dialog>
  );
}

function LaunchAccountDialog({
  instanceId,
  accountId,
  joinServer,
}: {
  instanceId: string;
  accountId?: string;
  joinServer?: string;
}) {
  const a = useApp();
  const instance = a.instances.find((entry) => entry.id === instanceId);
  const [selected, setSelected] = useState(accountId ?? '');
  const accounts = a.accounts.filter(
    (account) =>
      instance &&
      (!instance.providers.accounts || instance.providers.accounts === account.provider) &&
      a.providers.some(
        (provider) => provider.kind === 'accounts' && provider.id === account.provider,
      ),
  );
  const selectedId = accounts.some((account) => account.id === selected)
    ? selected
    : (accounts[0]?.id ?? '');
  return (
    <Dialog
      open={a.overlay !== null}
      onClose={() => a.setOverlay(null)}
      title={tr('Home.chooseLaunchAccount')}
      description={instance?.name}
      footer={
        <>
          <Action variant="secondary" onPress={() => a.setOverlay(null)}>
            {tr('overlays.cancel')}
          </Action>
          <Action
            icon="play"
            isDisabled={!selectedId}
            onPress={() => {
              a.setOverlay(null);
              a.launch(instanceId, selectedId, joinServer);
            }}
          >
            {tr('LaunchButton.launchGame')}
          </Action>
        </>
      }
    >
      <div className="stack">
        {accounts.length ? (
          <Choice
            label={tr('Home.launchAccount')}
            value={selectedId}
            onChange={setSelected}
            options={accounts.map((account) => ({
              id: account.id,
              name: `${account.name} · ${label(account.type)}`,
            }))}
          />
        ) : (
          <Notice>{tr('launch.noCompatibleAccount')}</Notice>
        )}
        <div className="row">
          <Action
            variant="secondary"
            icon="plus"
            onPress={() => a.setOverlay({ type: 'account', instanceId, joinServer })}
          >
            {tr('overlays.addAccount')}
          </Action>
          {instance && (
            <Action
              variant="ghost"
              icon="settings"
              onPress={() => {
                a.setOverlay(null);
                a.openInstance(instanceId, 'settings');
              }}
            >
              {tr('launch.configureServices')}
            </Action>
          )}
        </div>
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
        throw new Error(tr('overlays.configurationMustBeAJsonObject'));
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
            {tr('overlays.close')}
          </Action>
          <Action isPending={pending} onPress={() => void save()}>
            {tr('overlays.saveConfiguration')}
          </Action>
        </>
      }
    >
      <div className="stack">
        <div className="row">
          <AssetIcon builtin={p.builtin} kind="plugin" />
          <p>{p.desc}</p>
        </div>
        <div className="row">
          <Tag
            color={p.status === 'active' ? 'success' : p.status === 'error' ? 'danger' : 'default'}
          >
            {p.status === 'active'
              ? tr('overlays.running')
              : p.status === 'error'
                ? tr('overlays.failedToLoad')
                : tr('overlays.disabled')}
          </Tag>
          <Tag>{p.category}</Tag>
          <span className="flex-1" />
          <Toggle
            label={tr('overlays.enableValue', { value1: p.name })}
            value={p.enabled}
            disabled={p.id === a.settings.interfacePlugin}
            onChange={(enabled) => void a.command('plugins.setEnabled', { id, enabled })}
          />
        </div>
        {p.error && <Notice tone="danger">{p.error}</Notice>}
        <ConfigForm schema={p.manifest.configSchema} value={config} onChange={setConfig} />
        {p.managed?.previous && (
          <Action
            variant="secondary"
            isDisabled={pending}
            onPress={() => {
              setPending(true);
              setError('');
              void window.nixel
                .invoke('pluginCatalog.rollback', { id })
                .then(() => {
                  a.setOverlay(null);
                  a.setTaskOpen(true);
                })
                .catch((error) => setError(message(error)))
                .finally(() => setPending(false));
            }}
          >
            {tr('pluginDist.rollback')} · {p.managed.previous.version}
          </Action>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        {p.directory && (
          <Action
            variant="secondary"
            icon="folder"
            onPress={() => void window.nixel.openPath(p.directory ?? '')}
          >
            {tr('overlays.openPluginDirectory')}
          </Action>
        )}
        {!p.builtin && (
          <Action
            variant="danger-soft"
            icon="trash"
            onPress={() =>
              a.setOverlay({
                type: 'confirm',
                title: tr('overlays.removePluginValue', { value1: p.name }),
                detail: tr('overlays.uninstallThisPluginFromTheLauncherIts'),
                action: () => window.nixel.invoke('plugins.remove', { id }),
              })
            }
          >
            {tr('overlays.uninstallPlugin')}
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
      title={tr('overlays.installLocalPlugin')}
      footer={
        <>
          <Action variant="secondary" onPress={() => a.setOverlay(null)}>
            {tr('overlays.cancel')}
          </Action>
          <Action isPending={pending} isDisabled={!path} onPress={() => void install()}>
            {tr('overlays.installPlugin')}
          </Action>
        </>
      }
    >
      <div className="stack">
        <Notice>{tr('overlays.chooseATrustedDirectoryContainingNixelPlugin')}</Notice>
        <Field label={tr('overlays.pluginDirectory')} value={path} onChange={setPath} />
        <Action
          variant="secondary"
          icon="folder"
          onPress={() =>
            void window.nixel
              .selectPath({ kind: 'directory', title: tr('overlays.chooseNixelPluginDirectory') })
              .then((p) => {
                if (p) setPath(p);
              })
          }
        >
          {tr('overlays.browseDirectory')}
        </Action>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Dialog>
  );
}

function ImportDialog() {
  const a = useApp();
  const [mode, setMode] = useState('modpacks');
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
        mode === 'modpacks' ? 'instances.import' : 'instances.importDirectory',
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
      title={tr('overlays.importInstance')}
      footer={
        <>
          <Action variant="secondary" onPress={() => a.setOverlay(null)}>
            {tr('overlays.cancel')}
          </Action>
          <Action
            icon="download"
            isPending={pending}
            isDisabled={!path || detecting || (mode === 'local-directory' && !versionId)}
            onPress={() => void submit()}
          >
            {mode === 'modpacks'
              ? tr('overlays.importAndInstall')
              : tr('overlays.copyAsNewInstance')}
          </Action>
        </>
      }
    >
      <div className="stack">
        <Segments
          label={tr('overlays.importMethod')}
          value={mode}
          options={['modpacks', 'local-directory']}
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
          <h3>
            {path ||
              (mode === 'modpacks'
                ? tr('overlays.chooseModpackFile')
                : tr('overlays.chooseGameDirectory'))}
          </h3>
          <p>
            {mode === 'modpacks'
              ? tr('overlays.supportsModrinthMrpackAndCurseforgeZip')
              : tr('overlays.copyAnExistingGameDirectoryIncludingSaves')}
          </p>
          <Action
            variant="secondary"
            icon="folder"
            isDisabled={pending || detecting}
            onPress={() =>
              void window.nixel
                .selectPath({
                  kind: mode === 'modpacks' ? 'file' : 'directory',
                  title:
                    mode === 'modpacks'
                      ? tr('modpacks.importModpack')
                      : tr('overlays.chooseGameDirectory'),
                  filters: [
                    {
                      name: tr('overlays.modrinthCurseforgeModpacks'),
                      extensions: ['mrpack', 'zip'],
                    },
                  ],
                })
                .then(async (p) => {
                  if (!p) return;
                  setPath(p);
                  setError('');
                  setVersionId('');
                  setVersions([]);
                  if (mode !== 'local-directory') return;
                  setDetecting(true);
                  try {
                    const found = await window.nixel.invoke<
                      { versionId: string; version: string; loader: Loader }[]
                    >('instances.detectDirectory', { path: p });
                    setVersions(found);
                    if (found.length === 1 && found[0]) setVersionId(found[0].versionId);
                    if (!found.length) setError(tr('overlays.noImportableGameVersionsFoundInThis'));
                  } catch (e) {
                    setError(message(e));
                  } finally {
                    setDetecting(false);
                  }
                })
                .catch((e) => setError(message(e)))
            }
          >
            {tr('overlays.choosePath')}
          </Action>
        </div>
        <Field
          label={tr('overlays.instanceNameOptional')}
          value={name}
          onChange={setName}
          placeholder={
            mode === 'modpacks' ? tr('overlays.useModpackName') : tr('overlays.useDirectoryName')
          }
        />
        {mode === 'local-directory' && (
          <Choice
            label={detecting ? tr('overlays.detectingGameVersions') : tr('overlays.gameVersion')}
            value={versionId}
            onChange={setVersionId}
            options={[
              {
                id: '',
                name: detecting ? tr('overlays.detecting') : tr('overlays.chooseAVersion'),
              },
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
        title: tr('overlays.chooseBackgroundImage'),
        filters: [{ name: tr('overlays.images'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
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
    <Dialog
      open={a.overlay !== null}
      onClose={() => a.setOverlay(null)}
      title={tr('overlays.changeBackground')}
    >
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
          <span className="background-preview-label">{tr('overlays.alpineValley')}</span>
        </button>
        <div className="row">
          <Action icon="image" onPress={() => void choose()}>
            {tr('overlays.chooseLocalImage')}
          </Action>
          <Action
            variant="secondary"
            onPress={() => {
              a.setBackground('none');
              a.setOverlay(null);
            }}
          >
            {tr('overlays.solidBackground')}
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
      title={tr('overlays.welcomeToNixel')}
      footer={
        <>
          <span className="dialog-footer-note">{step + 1} / 3</span>
          {step > 0 && (
            <Action variant="secondary" onPress={() => setStep(step - 1)}>
              {tr('overlays.back')}
            </Action>
          )}
          <Action
            icon={step === 2 ? 'check' : 'arrow'}
            isPending={pending}
            isDisabled={step === 2 && Boolean(name) && !/^[A-Za-z0-9_]{1,16}$/.test(name)}
            onPress={() => (step === 2 ? void finish() : setStep(step + 1))}
          >
            {step === 2 ? tr('overlays.getStarted') : tr('overlays.next')}
          </Action>
        </>
      }
    >
      <Steps
        items={[tr('overlays.welcome'), tr('overlays.preferencesJava'), tr('overlays.gameAccount')]}
        step={step}
      />
      {step === 0 ? (
        <div className="wizard-content">
          <Brand size={68} />
          <h2>{tr('overlays.yourWorldYourWay')}</h2>
          <p>
            {tr('overlays.independentInstancesLocalDataAndComposablePlugin')}
            <br />
            {tr('overlays.setYourPreferencesThenCreateYourFirst')}
          </p>
        </div>
      ) : step === 1 ? (
        <div className="stack">
          <Segments
            value={a.theme === 'dark' ? 'dark' : a.theme === 'system' ? 'system' : 'light'}
            options={['light', 'dark', 'system']}
            onChange={(v) => a.setTheme(v === 'dark' ? 'dark' : v === 'light' ? 'light' : 'system')}
            label={tr('overlays.theme')}
          />
          <JavaSettings />
        </div>
      ) : (
        <div className="stack">
          <h2>{tr('overlays.chooseAGameIdentity')}</h2>
          {a.accounts.length ? (
            <Notice>{tr('setup.accountsReady', { count: a.accounts.length })}</Notice>
          ) : (
            <>
              <Field
                label={tr('overlays.offlineProfileNameOptional')}
                value={name}
                onChange={setName}
                placeholder="Player"
                description={tr('overlays.116LettersNumbersOrUnderscoresYou')}
              />
              <Notice>{tr('overlays.youCanSignInWithMicrosoftOr')}</Notice>
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
    <Dialog
      open={a.overlay !== null}
      onClose={() => a.setOverlay(null)}
      title={tr('overlays.searchLauncher')}
    >
      <div className="stack">
        <Search
          value={query}
          onChange={setQuery}
          placeholder={tr('overlays.searchInstancesOrPages')}
        />
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
            { id: 'resources', name: tr('App.resources') },
            { id: 'plugins', name: tr('App.plugins') },
            { id: 'accounts', name: tr('App.accounts') },
            { id: 'settings', name: tr('App.settings') },
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
  const [tab, setTab] = useState('all');
  const [log, setLog] = useState('');
  const tasks = a.tasks.filter(
    (t) =>
      tab === 'all' ||
      (tab === 'running'
        ? t.status === 'running'
        : tab === 'completed'
          ? t.status === 'completed'
          : t.status === 'failed' || t.status === 'cancelled'),
  );
  return (
    <Drawer.Backdrop isOpen={a.taskOpen} onOpenChange={a.setTaskOpen}>
      <Drawer.Content placement="right">
        <Drawer.Dialog className="task-drawer">
          <Drawer.CloseTrigger aria-label={tr('overlays.closeTaskCenter')} />
          <Drawer.Header>
            <Drawer.Heading>{tr('overlays.taskCenter')}</Drawer.Heading>
            <p className="muted">{tr('overlays.tasksContinueWhenYouSwitchPages')}</p>
          </Drawer.Header>
          <Drawer.Body>
            <Segments
              value={tab}
              options={['all', 'running', 'completed', 'other']}
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
                        {t.status === 'running' && t.activity
                          ? tr(`downloads.${t.activity}`)
                          : (
                              {
                                running: label('running'),
                                completed: label('completed'),
                                failed: tr('overlays.failed'),
                                cancelled: tr('overlays.cancelled'),
                              } as const
                            )[t.status]}
                      </Tag>
                    </div>
                    <div
                      className={`progress-track ${t.status === 'failed' ? 'progress-error' : ''}`}
                      role="progressbar"
                      aria-label={tr('overlays.valueProgress', { value1: t.name })}
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
                        {tr('overlays.taskLog')}
                        <Icon name={log === t.id ? 'down' : 'chevron'} size={13} />
                      </button>
                      {t.status === 'running' ? (
                        <TaskControls task={t} />
                      ) : (
                        (t.status === 'failed' || t.status === 'cancelled') && (
                          <Action
                            size="sm"
                            variant="secondary"
                            icon="refresh"
                            onPress={() => a.retryTask(t)}
                          >
                            {tr('overlays.retry')}
                          </Action>
                        )
                      )}
                    </div>
                    {log === t.id && (
                      <pre className="task-log">
                        {t.logs.length ? t.logs.join('\n') : tr('overlays.noTaskLogYet')}
                      </pre>
                    )}
                  </article>
                ))
              ) : (
                <Empty
                  title={tr('overlays.noTasksYet')}
                  detail={tr('overlays.installAGameOrAddResourcesTo')}
                  icon="download"
                />
              )}
            </div>
          </Drawer.Body>
          <Drawer.Footer>
            <span className="micro">
              {tr('tasks.activeCount', {
                count: a.tasks.filter((task) => task.status === 'running').length,
              })}
            </span>
            <Action variant="ghost" size="sm" onPress={a.clearTasks}>
              {tr('overlays.clearFinishedTasks')}
            </Action>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
