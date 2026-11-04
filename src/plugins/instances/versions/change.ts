import type { ChangeInstanceVersionInput } from '../../../shared/contracts';
import type { NixelHost, TaskContext } from '../../../shared/host-api';
import { tr } from '../../../shared/i18n';
import { getInstance } from '../../instance-state';
import { taskPhase } from '../../task-progress';
import { createBackup } from '../backups/operations';
import type { BackupRepository } from '../backups/repository';
import { gameProvider } from './catalog';
import { planVersionChange } from './plan';

export async function changeVersion(
  host: NixelHost,
  backups: BackupRepository,
  input: ChangeInstanceVersionInput,
  task: TaskContext,
) {
  task.report(0, tr('versionChange.checking'));
  const plan = await planVersionChange(host, input.id, input.target, task.signal, task.taskId);
  if (plan.fingerprint !== input.fingerprint) throw new Error(tr('versionChange.reviewChanged'));
  if (
    plan.content.some((entry) => entry.enabled && entry.status !== 'compatible') &&
    input.acceptRisks !== true
  )
    throw new Error(tr('versionChange.acceptRequired'));
  const backupId = await createBackup(
    host,
    backups,
    input.id,
    taskPhase(task, 5, 30),
    'version-change',
  );
  task.log(tr('versionChange.backupSaved', { id: backupId }));
  task.signal.throwIfAborted();
  const current = getInstance(host, input.id);
  const launchVersion = await gameProvider(host, input.id).install(
    { ...current, ...plan.target, launchVersion: undefined },
    taskPhase(task, 30, 98),
  );
  task.signal.throwIfAborted();
  // The previous launch selection remains valid until all target files are installed.
  await host.store.update((draft) => {
    const instance = draft.instances.find((entry) => entry.id === input.id);
    if (!instance) throw new Error(tr('game.instanceNotFound'));
    Object.assign(instance, plan.target, {
      launchVersion,
      kind: plan.target.loader,
      status: 'ready',
      error: undefined,
    });
    for (const entry of draft.content) if (entry.instance === input.id) delete entry.update;
  });
  task.report(100, tr('versionChange.completed'));
  task.log(tr('versionChange.completed'));
}
