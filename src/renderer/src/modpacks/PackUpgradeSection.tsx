import { useEffect, useState } from 'react';
import type { Instance, ResourceVersion } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/error-message';
import { tr } from '../../../shared/i18n';
import type { ModpackUpgradePlan } from '../../../shared/modpack-contracts';
import { useApp } from '../state';
import { Action, Choice, Dialog, Group, Notice, SettingRow, Tag } from '../ui';
export function PackUpgradeSection({ instance }: { instance: Instance }) {
  const a = useApp();
  const [open, setOpen] = useState(false);
  const busy =
    a.running.includes(instance.id) ||
    a.tasks.some((task) => task.instanceId === instance.id && task.status === 'running');
  if (!instance.modpack) return null;
  return (
    <Group title={instance.modpack.name}>
      <SettingRow title={tr('packUpgrade.version')}>
        <span>
          {instance.modpack.provenance
            ? a.providers.find((provider) => provider.id === instance.modpack?.provenance?.source)
                ?.name || instance.modpack.provenance.source
            : tr('packUpgrade.localSource')}{' '}
          · {instance.modpack.version}
        </span>
        <Action size="sm" variant="secondary" isDisabled={busy} onPress={() => setOpen(true)}>
          {tr('packUpgrade.title')}
        </Action>
      </SettingRow>
      {open && <UpgradeDialog instance={instance} onClose={() => setOpen(false)} />}
    </Group>
  );
}
function UpgradeDialog({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const a = useApp();
  const [versions, setVersions] = useState<ResourceVersion[]>([]);
  const [versionId, setVersionId] = useState('');
  const [path, setPath] = useState('');
  const [job, setJob] = useState<{ taskId: string; planId: string } | null>(null);
  const [plan, setPlan] = useState<ModpackUpgradePlan | null>(null);
  const [choices, setChoices] = useState<Record<string, 'keep' | 'replace'>>({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const task = a.tasks.find((task) => task.id === job?.taskId);
  const working = pending || task?.status === 'running';
  useEffect(() => {
    let active = true;
    window.nixel
      .invoke<ResourceVersion[]>('modpacks.versions', { id: instance.id })
      .then((result) => {
        if (active) {
          setVersions(result);
          setVersionId(result[0]?.id || '');
        }
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [instance.id]);
  useEffect(() => {
    if (!job || !task || task.status === 'running') return;
    if (task.status !== 'completed') {
      setError(task.error || task.detail);
      return;
    }
    let active = true;
    window.nixel
      .invoke<ModpackUpgradePlan>('modpacks.upgradePlan', { planId: job.planId })
      .then((result) => {
        if (active) {
          setPlan(result);
          setChoices({});
          setJob(null);
        }
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [job, task]);
  async function prepare() {
    setPending(true);
    setError('');
    setPlan(null);
    try {
      setJob(
        await window.nixel.invoke('modpacks.prepareUpgrade', {
          id: instance.id,
          ...(path ? { path } : { versionId }),
        }),
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  async function apply() {
    if (!plan) return;
    setPending(true);
    setError('');
    try {
      await window.nixel.invoke('modpacks.upgrade', {
        id: instance.id,
        planId: plan.id,
        fingerprint: plan.fingerprint,
        choices,
      });
      a.setTaskOpen(true);
      onClose();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  const unresolved = plan?.changes.some(
    (change) => change.action === 'conflict' && !choices[change.path],
  );
  const actionLabels = {
    add: 'packUpgrade.add',
    remove: 'packUpgrade.remove',
    replace: 'packUpgrade.changedFile',
    keep: 'packUpgrade.unchanged',
    conflict: 'packUpgrade.conflict',
  } as const;
  return (
    <Dialog
      wide
      open
      onClose={onClose}
      title={tr('packUpgrade.title')}
      footer={
        <>
          <Action variant="secondary" onPress={onClose}>
            {tr('overlays.close')}
          </Action>
          {working && job && (
            <Action
              variant="secondary"
              onPress={() => void a.command('tasks.cancel', { id: job.taskId })}
            >
              {tr('overlays.cancel')}
            </Action>
          )}
          <Action
            isPending={working}
            isDisabled={working || (plan ? unresolved : !path && !versionId)}
            onPress={() => void (plan ? apply() : prepare())}
          >
            {plan ? tr('packUpgrade.apply') : tr('packUpgrade.compare')}
          </Action>
        </>
      }
    >
      <div className="stack">
        {!plan && (
          <>
            {versions.length > 0 && (
              <Choice
                label={tr('packUpgrade.version')}
                value={versionId}
                options={versions.map((version) => ({ id: version.id, name: version.name }))}
                onChange={(value) => {
                  setVersionId(value);
                  setPath('');
                }}
              />
            )}
            <Action
              variant="secondary"
              isDisabled={working}
              onPress={() => {
                void window.nixel
                  .selectPath({
                    kind: 'file',
                    title: tr('packUpgrade.local'),
                    filters: [{ name: tr('packUpgrade.local'), extensions: ['mrpack', 'zip'] }],
                  })
                  .then((value) => {
                    if (value) setPath(value);
                  })
                  .catch((error) => setError(errorMessage(error)));
              }}
            >
              {tr('packUpgrade.local')}
            </Action>
            {path && <p className="micro mono">{path}</p>}
          </>
        )}
        {task && (
          <Notice>
            {task.detail} · {Math.round(task.progress)}%
          </Notice>
        )}
        {plan && (
          <>
            <Notice>{tr('packUpgrade.review')}</Notice>
            <p>
              {plan.name} · {plan.version}
            </p>
            {plan.changes.every((change) => change.action === 'keep') && (
              <Notice>{tr('packUpgrade.noChanges')}</Notice>
            )}
            <p>
              {tr('packUpgrade.target', {
                version: plan.target.version,
                loader: plan.target.loader,
              })}
            </p>
            <div className="stack">
              {plan.changes
                .filter((change) => change.action !== 'keep' || change.disabledHash)
                .map((change) => (
                  <div key={change.path} className="stack">
                    <div className="row">
                      <span className="micro mono">{change.path}</span>
                      <Tag>{tr(actionLabels[change.action])}</Tag>
                    </div>
                    {change.disabledHash && <Notice>{tr('packUpgrade.disabled')}</Notice>}
                    {!change.protected && (
                      <Choice
                        label={change.path}
                        value={
                          choices[change.path] ||
                          (change.action === 'conflict'
                            ? ''
                            : change.action === 'keep'
                              ? 'keep'
                              : 'replace')
                        }
                        options={[
                          ...(change.action === 'conflict'
                            ? [{ id: '', name: tr('packUpgrade.chooseAction') }]
                            : []),
                          { id: 'keep', name: tr('packUpgrade.keep') },
                          { id: 'replace', name: tr('packUpgrade.replace') },
                        ]}
                        onChange={(value) =>
                          setChoices((current) => ({
                            ...current,
                            [change.path]: value as 'keep' | 'replace',
                          }))
                        }
                      />
                    )}
                  </div>
                ))}
            </div>
          </>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Dialog>
  );
}
