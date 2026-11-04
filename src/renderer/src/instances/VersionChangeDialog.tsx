import { useState } from 'react';
import type { InstanceVersionPlan, InstanceVersionTarget } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/error-message';
import { tr } from '../../../shared/i18n';
import { useApp } from '../state';
import { Action, Dialog, Notice } from '../ui';
import { VersionChangeReview } from './VersionChangeReview';
import { VersionTargetPicker } from './VersionTargetPicker';

export function VersionChangeDialog({ instanceId }: { instanceId: string }) {
  const a = useApp();
  const instance = a.instances.find((item) => item.id === instanceId);
  const [plan, setPlan] = useState<InstanceVersionPlan>();
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy =
    a.running.includes(instanceId) ||
    a.tasks.some((task) => task.instanceId === instanceId && task.status === 'running');
  const review = async (target: InstanceVersionTarget) => {
    setPending(true);
    setError('');
    setAccepted(false);
    try {
      setPlan(
        await window.nixel.invoke<InstanceVersionPlan>('instances.planVersionChange', {
          id: instanceId,
          target,
        }),
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  const submit = async () => {
    if (!plan) return;
    setPending(true);
    setError('');
    try {
      await window.nixel.invoke('instances.changeVersion', {
        id: instanceId,
        target: plan.target,
        fingerprint: plan.fingerprint,
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
  const needsAcceptance = plan?.content.some(
    (entry) => entry.enabled && entry.status !== 'compatible',
  );
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
            isDisabled={pending}
            onPress={() => {
              if (plan) {
                setPlan(undefined);
                setError('');
              } else a.setOverlay(null);
            }}
          >
            {plan ? tr('overlays.back') : tr('overlays.cancel')}
          </Action>
          {plan && (
            <Action
              icon="download"
              isPending={pending}
              isDisabled={busy || !instance || Boolean(needsAcceptance && !accepted)}
              onPress={() => void submit()}
            >
              {tr('versionChange.apply')}
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
          {plan && (
            <VersionChangeReview
              plan={plan}
              accepted={accepted}
              onAccept={setAccepted}
              minecraftChanged={plan.target.version !== instance.version}
            />
          )}
        </>
      )}
      {busy && <Notice tone="warning">{tr('game.thisInstanceHasAnActiveTaskWait')}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
    </Dialog>
  );
}
