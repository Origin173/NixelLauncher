import { useEffect, useState } from 'react';
import './resources.css';
import type { Resource, ResourceDetails, ResourceVersion } from '../../../shared/contracts';
import { errorMessage as message } from '../../../shared/error-message';
import { i18n, label, tr } from '../../../shared/i18n';
import { resourceSource } from '../data';
import { useApp } from '../state';
import { Action, Choice, Dialog, Empty, Notice, Segments, Tag } from '../ui';
import { AssetIcon } from '../workspace';
import { ProjectDetails } from './ProjectDetails';
import { useCatalogRequest } from './useCatalogRequest';
import { VersionDetails } from './VersionDetails';
export function ResourceDialog({
  resource: r,
  instanceId,
  initialTab = 'project',
}: {
  resource: Resource;
  instanceId?: string;
  initialTab?: 'project' | 'versions';
}) {
  const a = useApp();
  const [tab, setTab] = useState<string>(initialTab);
  const details = useCatalogRequest<ResourceDetails>('resources.details', {
    projectId: r.id,
    source: r.source,
  });
  const isPack = r.category === 'modpacks';
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
            {tr('overlays.cancel')}
          </Action>
          {tab !== 'versions' ? (
            <Action icon="download" onPress={() => setTab('versions')}>
              {tr('resourceDetails.chooseVersion')}
            </Action>
          ) : (
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
                ? tr('LaunchButton.installingValue', { value1: Math.round(installTask.progress) })
                : alreadyInstalled
                  ? label('installed')
                  : isPack
                    ? tr('overlays.createModpackInstance')
                    : tr('overlays.installToInstance')}
            </Action>
          )}
        </>
      }
    >
      <div className="stack">
        <p>{r.desc}</p>
        <div className="row">
          <AssetIcon src={r.icon} kind={r.category} />
          <Tag>{label(r.category)}</Tag>
          <span className="muted">{tr('catalog.downloadCount', { count: r.downloads })}</span>
          {r.url && (
            <Action
              size="sm"
              variant="ghost"
              icon="external"
              onPress={() => void window.nixel.openExternal(r.url ?? '')}
            >
              {tr('overlays.viewProject')}
            </Action>
          )}
        </div>
        <Segments
          secondary
          value={tab}
          options={['project', 'gallery', 'versions']}
          onChange={setTab}
          label={tr('resourceDetails.tabs')}
        />
        {tab !== 'versions' ? (
          <div className="resource-detail-panel">
            {details.loading ? (
              <p className="muted" role="status">
                {tr('resourceDetails.loading')}
              </p>
            ) : details.error ? (
              <Notice tone="danger">
                <div className="stack-tight">
                  {details.error}
                  <Action size="sm" variant="secondary" onPress={details.retry}>
                    {tr('resourceDetails.retry')}
                  </Action>
                </div>
              </Notice>
            ) : (
              <ProjectDetails details={details.data ?? null} gallery={tab === 'gallery'} />
            )}
          </div>
        ) : (
          <>
            {isPack || a.instances.length ? (
              <>
                {!isPack && instanceId && (
                  <div className="install-target-summary">
                    {tr('overlays.installTo')}
                    <strong>{targetInstance?.name ?? tr('overlays.instanceRemoved')}</strong>
                    {targetInstance && (
                      <span className="muted">
                        {targetInstance.version} · {targetInstance.loader}
                      </span>
                    )}
                  </div>
                )}
                {!isPack && !instanceId && (
                  <Choice
                    label={tr('overlays.installTarget')}
                    value={target}
                    onChange={(id) => {
                      setVersion('');
                      setVersions([]);
                      setTarget(id);
                    }}
                    options={a.instances.map((i) => ({
                      id: i.id,
                      name: `${i.name} · ${i.version} · ${i.loader}`,
                    }))}
                  />
                )}
                {loading ? (
                  <p className="muted">{tr('overlays.fetchingCompatibleVersions')}</p>
                ) : versions.length ? (
                  <Choice
                    label={tr('overlays.resourceVersion')}
                    value={version}
                    onChange={setVersion}
                    options={versions.map((v) => ({
                      id: v.id,
                      name: `${v.version} · ${new Date(v.publishedAt).toLocaleDateString(i18n.language)}`,
                    }))}
                  />
                ) : (
                  <Notice tone="warning">
                    {isPack
                      ? tr('overlays.noInstallableModpackVersionsFound')
                      : tr('overlays.noResourceVersionsMatchThisInstanceS')}
                  </Notice>
                )}
              </>
            ) : (
              <Empty
                title={tr('overlays.createAnInstanceFirst')}
                detail={tr('overlays.chooseAGameVersionAndLoaderTo')}
              >
                <Action onPress={() => a.setOverlay({ type: 'create' })}>
                  {tr('overlays.createInstance')}
                </Action>
              </Empty>
            )}
            {error && <Notice tone="danger">{error}</Notice>}
            {version && !loading && !error && (
              <VersionDetails
                resource={r}
                versionId={version}
                baseUrl={details.data?.url || r.url}
              />
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
