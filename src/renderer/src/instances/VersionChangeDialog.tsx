import { useState } from 'react';
import type { InstanceVersionPlan, InstanceVersionTarget } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/error-message';
import { tr } from '../../../shared/i18n';
import type { VersionContentChoice, VersionContentPlan } from '../../../shared/version-content';
import { useApp } from '../state';
import { Action, Dialog, Notice } from '../ui';
import { usePreparedPlan } from '../usePreparedPlan';
import { VersionChangeReview } from './VersionChangeReview';
import { VersionContentConfirmation } from './VersionContentConfirmation';
import { VersionTargetPicker } from './VersionTargetPicker';

export function VersionChangeDialog({
  instanceId,
  initialPlanId,
}: {
  instanceId: string;
  initialPlanId?: string;
}) {
  const a = useApp();
  const instance = a.instances.find((item) => item.id === instanceId);
  const [plan, setPlan] = useState<InstanceVersionPlan>();
  const [choices, setChoices] = useState<Record<string, VersionContentChoice>>({});
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [taskId, setTaskId] = useState<string>();
  const [resumeId, setResumeId] = useState(initialPlanId);
  const task = a.tasks.find((task) => task.id === taskId);
  const preview = usePreparedPlan<VersionContentPlan>(
    'instances.versionContentPlan',
    resumeId ?? task?.resultId,
  );
  const contentPlan = preview.plan;
  const working = pending || task?.status === 'running' || preview.loading;
  const busy =
    a.running.includes(instanceId) ||
    a.tasks.some((task) => task.instanceId === instanceId && task.status === 'running');
  const review = async (target: InstanceVersionTarget) => {
    setPending(true);
    setError('');
    setAccepted(false);
    setResumeId(undefined);
    setTaskId(undefined);
    try {
      const result = await window.nixel.invoke<InstanceVersionPlan>('instances.planVersionChange', {
        id: instanceId,
        target,
      });
      setPlan(result);
      setChoices(
        Object.fromEntries(
          result.content
            .filter((entry) => !entry.enabled || entry.status === 'compatible')
            .map((entry) => [entry.id, { action: 'keep' }]),
        ),
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  const submit = async () => {
    if (!contentPlan || contentPlan.instanceId !== instanceId) return;
    setPending(true);
    setError('');
    try {
      await window.nixel.invoke('instances.changeVersion', {
        id: instanceId,
        target: contentPlan.target,
        fingerprint: contentPlan.fingerprint,
        contentPlanId: contentPlan.id,
        acceptRisks: accepted,
      });
      a.setOverlay(null);
      a.setTaskOpen(true);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  const confirm = async () => {
    if (!plan) return;
    setPending(true);
    setError('');
    setTaskId(undefined);
    try {
      const job = await window.nixel.invoke<{ taskId: string }>('instances.planVersionContent', {
        id: instanceId,
        target: plan.target,
        fingerprint: plan.fingerprint,
        choices,
      });
      setTaskId(job.taskId);
      setAccepted(false);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  const needsAcceptance =
    contentPlan && (contentPlan.minecraftChanged || contentPlan.retainedRisks.length > 0);
  const missingChoices = plan?.content.some((entry) => !choices[entry.id]);
  return (
    <Dialog
      wide
      open={a.overlay !== null}
      onClose={() => a.setOverlay(null)}
      title={tr('versionChange.title')}
      description={instance?.name}
      footer={
        <>
          <Action
            variant="secondary"
            isDisabled={working}
            onPress={() => {
              if (contentPlan || preview.error) {
                setResumeId(undefined);
                setTaskId(undefined);
                setError('');
              } else if (plan) {
                setPlan(undefined);
                setTaskId(undefined);
                setError('');
              } else a.setOverlay(null);
            }}
          >
            {plan || contentPlan || preview.error ? tr('overlays.back') : tr('overlays.cancel')}
          </Action>
          {task?.status === 'running' && (
            <Action
              variant="secondary"
              onPress={() => void a.command('tasks.cancel', { id: task.id })}
            >
              {tr('overlays.cancel')}
            </Action>
          )}
          {(plan || contentPlan) && (
            <Action
              icon="download"
              isPending={working}
              isDisabled={
                working ||
                busy ||
                !instance ||
                (contentPlan
                  ? contentPlan.instanceId !== instanceId || Boolean(needsAcceptance && !accepted)
                  : missingChoices)
              }
              onPress={() => void (contentPlan ? submit() : confirm())}
            >
              {contentPlan ? tr('versionChange.apply') : tr('versionContent.review')}
            </Action>
          )}
        </>
      }
    >
      {!instance ? (
        <Notice tone="danger">{tr('game.instanceNotFound')}</Notice>
      ) : (
        <>
          {(!resumeId || preview.error) && (
            <div hidden={Boolean(plan || contentPlan) || working}>
              <VersionTargetPicker instance={instance} onReview={(target) => void review(target)} />
            </div>
          )}
          {working && !plan && !contentPlan && <p role="status">{tr('versionChange.checking')}</p>}
          {contentPlan && (
            <VersionContentConfirmation
              plan={contentPlan}
              accepted={accepted}
              onAccept={setAccepted}
            />
          )}
          {plan && !contentPlan && (
            <VersionChangeReview
              plan={plan}
              choices={choices}
              pending={working}
              onChange={(id, choice) =>
                setChoices((current) => {
                  const next = { ...current };
                  if (choice) next[id] = choice;
                  else delete next[id];
                  return next;
                })
              }
              minecraftChanged={plan.target.version !== instance.version}
            />
          )}
        </>
      )}
      {task && !contentPlan && (
        <Notice>
          {task.detail} · {Math.round(task.progress)}%
        </Notice>
      )}
      {busy && !task && (
        <Notice tone="warning">{tr('game.thisInstanceHasAnActiveTaskWait')}</Notice>
      )}
      {task && (task.status === 'failed' || task.status === 'cancelled') && (
        <Notice tone="danger">{task.error || task.detail}</Notice>
      )}
      {preview.error && <Notice tone="danger">{preview.error}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
    </Dialog>
  );
}
