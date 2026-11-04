import { randomUUID } from 'node:crypto';
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChangeInstanceVersionInput, InstalledContent } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/error-message';
import type { NixelHost, TaskContext } from '../../../shared/host-api';
import { tr } from '../../../shared/i18n';
import { checkedPath, FileTransaction } from '../../file-transaction';
import { download, inside } from '../../files';
import { assertInstanceIdle, getInstance } from '../../instance-state';
import type { ResourceProvider } from '../../providers';
import { taskPhase } from '../../task-progress';
import { createBackup } from '../backups/operations';
import type { BackupRepository } from '../backups/repository';
import { gameProvider } from './catalog';
import { contentPlanDirectory, readContentPlan } from './content-plan';
import { contentPath, contentState } from './content-state';

export async function changeVersion(
  host: NixelHost,
  backups: BackupRepository,
  input: ChangeInstanceVersionInput,
  task: TaskContext,
) {
  assertInstanceIdle(host, input.id, task.taskId);
  task.report(0, tr('versionChange.checking'));
  const prepared = await readContentPlan(host, input.contentPlanId);
  const { view, downloads, choices } = prepared;
  if (
    view.instanceId !== input.id ||
    view.fingerprint !== input.fingerprint ||
    JSON.stringify(view.target) !== JSON.stringify(input.target)
  )
    throw new Error(tr('versionChange.reviewChanged'));
  const current = structuredClone(getInstance(host, input.id));
  async function verify() {
    const state = await contentState(host, getInstance(host, input.id), view.target, task.signal);
    if (state.fingerprint !== prepared.initialFingerprint)
      throw new Error(tr('versionChange.reviewChanged'));
  }
  await verify();
  if ((view.retainedRisks.length > 0 || view.minecraftChanged) && input.acceptRisks !== true)
    throw new Error(tr('versionChange.acceptRequired'));
  for (const source of new Set(downloads.map((file) => file.source)))
    host.providers.get<ResourceProvider>('resources', source);
  const backupId = await createBackup(
    host,
    backups,
    input.id,
    taskPhase(task, 0, 20),
    'version-change',
  );
  task.log(tr('versionChange.backupSaved', { id: backupId }));
  const directory = contentPlanDirectory(host, view.id),
    stageRoot = join(directory, 'files');
  await mkdir(stageRoot, { recursive: true });
  const operations = new Map<string, string | undefined>();
  for (const entry of prepared.entries) {
    const choice = choices[entry.id];
    if (choice?.action === 'update') operations.set(contentPath(entry), undefined);
    else if (choice?.action === 'disable' && entry.enabled) {
      const stage = inside(stageRoot, `disable-${entry.id}`);
      await copyFile(await checkedPath(current.directory, contentPath(entry)), stage);
      operations.set(contentPath(entry), undefined);
      operations.set(`${contentPath(entry)}.disabled`, stage);
    }
  }
  for (const [index, file] of downloads.entries()) {
    task.signal.throwIfAborted();
    const stage = inside(stageRoot, `download-${index}`);
    task.log(tr('minecraft-engine.installValueValue', { value1: file.name, value2: file.version }));
    await download(file.url, stage, task.signal, file.hashes, (received, total) =>
      task.report(
        20 + ((index + (total ? received / total : 0)) / Math.max(downloads.length, 1)) * 35,
        tr('versionContent.staging', { name: file.name }),
      ),
    );
    operations.set(file.path, stage);
  }
  task.signal.throwIfAborted();
  const launchVersion = await gameProvider(host, input.id).install(
    { ...current, ...view.target, launchVersion: undefined },
    taskPhase(task, 55, 80),
  );
  await verify();
  const transaction = new FileTransaction(current.directory, join(directory, 'rollback'));
  await host.store.update((draft) => {
    const instance = draft.instances.find((entry) => entry.id === input.id);
    if (!instance) throw new Error(tr('game.instanceNotFound'));
    instance.status = 'error';
    instance.error = tr('versionContent.interrupted', { id: backupId });
  });
  try {
    let completed = 0;
    for (const [path, source] of operations) {
      task.signal.throwIfAborted();
      await transaction.write(path, source);
      task.report(80 + (++completed / Math.max(operations.size, 1)) * 18, path);
    }
    task.signal.throwIfAborted();
    await host.store.update((draft) => {
      const instance = draft.instances.find((entry) => entry.id === input.id);
      if (!instance) throw new Error(tr('game.instanceNotFound'));
      Object.assign(instance, view.target, {
        launchVersion,
        kind: view.target.loader,
        status: 'ready',
        error: undefined,
      });
      draft.content = draft.content.filter(
        (entry) => entry.instance !== input.id || choices[entry.id]?.action !== 'update',
      );
      for (const entry of draft.content.filter((entry) => entry.instance === input.id)) {
        if (choices[entry.id]?.action === 'disable' && entry.enabled) {
          entry.enabled = false;
          entry.fileName = `${entry.fileName}.disabled`;
        }
        delete entry.update;
      }
      draft.content.push(
        ...downloads.map(
          (file): InstalledContent => ({
            id: file.existingId || randomUUID(),
            instance: input.id,
            name: file.name,
            icon: file.icon,
            version: file.version,
            category: file.category,
            fileName: file.enabled ? file.fileName : `${file.fileName}.disabled`,
            enabled: file.enabled,
            color: 'green',
            source: file.source,
            projectId: file.projectId,
            versionId: file.versionId,
          }),
        ),
      );
    });
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (failure) {
      throw new AggregateError(
        [error, failure],
        tr('versionContent.rollbackFailed', { id: backupId }),
      );
    }
    await host.store.update((draft) => {
      const instance = draft.instances.find((entry) => entry.id === input.id);
      if (instance) {
        instance.status = current.status;
        instance.error = current.error;
      }
    });
    throw error;
  }
  try {
    await transaction.cleanup();
  } catch (error) {
    task.log(tr('versionContent.cleanupFailed', { error: errorMessage(error) }));
  }
  task.report(100, tr('versionChange.completed'));
  task.log(tr('versionChange.completed'));
}
