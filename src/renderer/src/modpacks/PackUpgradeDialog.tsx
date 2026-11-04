import { useEffect, useState } from 'react';
import type { ResourceVersion } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/error-message';
import { tr } from '../../../shared/i18n';
import type { ModpackUpgradePlan } from '../../../shared/modpack-contracts';
import { useApp } from '../state';
import { Action, Choice, Dialog, Notice, Tag } from '../ui';
import { usePreparedPlan } from '../usePreparedPlan';

export function PackUpgradeDialog({
  instanceId,
  initialPlanId,
}: {
  instanceId: string;
  initialPlanId?: string;
}) {
  const a = useApp();
  const instance = a.instances.find((item) => item.id === instanceId);
  const onClose = () => a.setOverlay(null);
  const [versions, setVersions] = useState<ResourceVersion[]>([]);
  const [versionId, setVersionId] = useState('');
  const [path, setPath] = useState('');
  const [taskId, setTaskId] = useState<string>();
  const [resumeId, setResumeId] = useState(initialPlanId);
  const [choices, setChoices] = useState<Record<string, 'keep' | 'replace'>>({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const task = a.tasks.find((task) => task.id === taskId);
  const preview = usePreparedPlan<ModpackUpgradePlan>(
    'modpacks.upgradePlan',
    resumeId ?? task?.resultId,
  );
  const plan = preview.plan;
  const working = pending || task?.status === 'running' || preview.loading;
  const busy =
    a.running.includes(instanceId) ||
    a.tasks.some((task) => task.instanceId === instanceId && task.status === 'running');
  const canCompare = !plan && !preview.loading && Boolean(instance?.modpack);
  useEffect(() => {
    if (!canCompare) return;
    let active = true;
    window.nixel
      .invoke<ResourceVersion[]>('modpacks.versions', { id: instanceId })
      .then((result) => {
        if (active) {
          setVersions(result);
          setVersionId((selected) => selected || result[0]?.id || '');
        }
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [canCompare, instanceId]);
  function resetPreview() {
    setResumeId(undefined);
    setTaskId(undefined);
    setChoices({});
    setError('');
  }
  async function prepare() {
    setPending(true);
    resetPreview();
    try {
      const job = await window.nixel.invoke<{ taskId: string }>('modpacks.prepareUpgrade', {
        id: instanceId,
        ...(path ? { path } : { versionId }),
      });
      setTaskId(job.taskId);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  async function apply() {
    if (!plan || plan.instanceId !== instanceId) return;
    setPending(true);
    setError('');
    try {
      await window.nixel.invoke('modpacks.upgrade', {
        id: instanceId,
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
      open={a.overlay !== null}
      onClose={onClose}
      title={tr('packUpgrade.title')}
      description={instance?.name}
      footer={
        <>
          <Action variant="secondary" onPress={plan ? resetPreview : onClose}>
            {plan ? tr('overlays.back') : tr('overlays.close')}
          </Action>
          {task?.status === 'running' && (
            <Action
              variant="secondary"
              onPress={() => void a.command('tasks.cancel', { id: task.id })}
            >
              {tr('overlays.cancel')}
            </Action>
          )}
          <Action
            isPending={working}
            isDisabled={
              working ||
              busy ||
              !instance?.modpack ||
              (plan ? unresolved || plan.instanceId !== instanceId : !path && !versionId)
            }
            onPress={() => void (plan ? apply() : prepare())}
          >
            {plan ? tr('packUpgrade.apply') : tr('packUpgrade.compare')}
          </Action>
        </>
      }
    >
      <div className="stack">
        {!instance && <Notice tone="danger">{tr('game.instanceNotFound')}</Notice>}
        {canCompare && (
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
        {task && !plan && (
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
        {task && (task.status === 'failed' || task.status === 'cancelled') && (
          <Notice tone="danger">{task.error || task.detail}</Notice>
        )}
        {preview.error && <Notice tone="danger">{preview.error}</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Dialog>
  );
}
