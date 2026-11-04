import { useEffect, useState } from 'react';
import type { InstanceVersionPlan, InstanceVersionTarget } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/error-message';
import { tr } from '../../../shared/i18n';
import type { VersionContentChoice, VersionContentPlan } from '../../../shared/version-content';
import { useApp } from '../state';
import { Action, Dialog, Notice } from '../ui';
import { VersionChangeReview } from './VersionChangeReview';
import { VersionContentConfirmation } from './VersionContentConfirmation';
import { VersionTargetPicker } from './VersionTargetPicker';

export function VersionChangeDialog({ instanceId }: { instanceId: string }) {
  const a = useApp();
  const instance = a.instances.find((item) => item.id === instanceId);
  const [plan, setPlan] = useState<InstanceVersionPlan>();
  const [choices, setChoices] = useState<Record<string, VersionContentChoice>>({});
  const [contentPlan, setContentPlan] = useState<VersionContentPlan>();
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<{ planId: string; taskId: string }>();
  const task = a.tasks.find((task) => task.id === job?.taskId);
  const working = pending || task?.status === 'running';
  useEffect(() => {
    if (!job || !task || task.status === 'running') return;
    if (task.status !== 'completed') {
      setError(task.error || task.detail);
      setJob(undefined);
      return;
    }
    let active = true;
    window.nixel
      .invoke<VersionContentPlan>('instances.versionContentPlan', { planId: job.planId })
      .then((result) => {
        if (active) {
          setContentPlan(result);
          setAccepted(false);
          setJob(undefined);
        }
      })
      .catch((error) => {
        if (active) {
          setError(errorMessage(error));
          setJob(undefined);
        }
      });
    return () => {
      active = false;
    };
  }, [job, task]);
  const busy =
    a.running.includes(instanceId) ||
    a.tasks.some((task) => task.instanceId === instanceId && task.status === 'running');
  const review = async (target: InstanceVersionTarget) => {
    setPending(true);
    setError('');
    setAccepted(false);
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
    if (!plan || !contentPlan) return;
    setPending(true);
    setError('');
    try {
      await window.nixel.invoke('instances.changeVersion', {
        id: instanceId,
        target: plan.target,
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
    try {
      setJob(
        await window.nixel.invoke<{ planId: string; taskId: string }>(
          'instances.planVersionContent',
          {
            id: instanceId,
            target: plan.target,
            fingerprint: plan.fingerprint,
            choices,
          },
        ),
      );
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
              if (contentPlan) {
                setContentPlan(undefined);
                setError('');
              } else if (plan) {
                setPlan(undefined);
                setError('');
              } else a.setOverlay(null);
            }}
          >
            {plan ? tr('overlays.back') : tr('overlays.cancel')}
          </Action>
          {working && job && (
            <Action
              variant="secondary"
              onPress={() => void a.command('tasks.cancel', { id: job.taskId })}
            >
              {tr('overlays.cancel')}
            </Action>
          )}
          {plan && (
            <Action
              icon="download"
              isPending={working}
              isDisabled={
                busy ||
                !instance ||
                (contentPlan ? Boolean(needsAcceptance && !accepted) : missingChoices)
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
          <div hidden={Boolean(plan) || pending}>
            <VersionTargetPicker instance={instance} onReview={(target) => void review(target)} />
          </div>
          {pending && !plan && <p role="status">{tr('versionChange.checking')}</p>}
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
      {task && (
        <Notice>
          {task.detail} · {Math.round(task.progress)}%
        </Notice>
      )}
      {busy && !job && <Notice tone="warning">{tr('game.thisInstanceHasAnActiveTaskWait')}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
    </Dialog>
  );
}
