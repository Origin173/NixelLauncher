import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { NixelHost, TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import type { ModpackUpgradeInput } from '../../shared/modpack-contracts';
import { hashFile, inside } from '../files';
import { assertInstanceIdle, getInstance } from '../instance-state';
import { createBackup } from '../instances/backups/operations';
import type { BackupRepository } from '../instances/backups/repository';
import type { GameProvider } from '../providers';
import { contentDirectories } from '../resource-files';
import { taskPhase } from '../task-progress';
import { checkedPath, comparePack, planFingerprint } from './diff';
import { contentRecords } from './metadata';
import { readPrepared, upgradeDirectory } from './prepare';

export async function applyUpgrade(
  host: NixelHost,
  backups: BackupRepository,
  input: ModpackUpgradeInput,
  task: TaskContext,
) {
  assertInstanceIdle(host, input.id, task.taskId);
  const instance = getInstance(host, input.id);
  const { plan, next, content } = await readPrepared(host, input.planId);
  if (plan.instanceId !== input.id) throw new Error(tr('packUpgrade.expired'));
  const changes = await comparePack(instance, next, task.signal);
  if (
    plan.fingerprint !== input.fingerprint ||
    planFingerprint(instance, changes, plan.target) !== input.fingerprint
  )
    throw new Error(tr('packUpgrade.changed'));
  for (const change of changes) {
    const choice = input.choices[change.path];
    if (change.action === 'conflict' && choice !== 'keep' && choice !== 'replace')
      throw new Error(tr('packUpgrade.resolveConflicts'));
    if (choice !== undefined && choice !== 'keep' && choice !== 'replace')
      throw new Error(tr('packUpgrade.resolveConflicts'));
    if (change.protected && choice === 'replace') throw new Error(tr('packUpgrade.protected'));
  }
  const directory = upgradeDirectory(host, input.planId);
  const filesRoot = join(directory, 'files');
  for (const file of next.files) {
    if (
      (await hashFile(await checkedPath(filesRoot, file.path), 'sha256', task.signal)) !==
      file.sha256
    )
      throw new Error(tr('packUpgrade.changed'));
  }
  const backupId = await createBackup(
    host,
    backups,
    input.id,
    taskPhase(task, 0, 25),
    'modpack-upgrade',
  );
  task.log(tr('versionChange.backupSaved', { id: backupId }));
  const launchVersion = await host.providers
    .get<GameProvider>('game', instance.providers.game)
    .install({ ...instance, ...plan.target, launchVersion: undefined }, taskPhase(task, 25, 65));
  const currentChanges = await comparePack(instance, next, task.signal);
  if (planFingerprint(instance, currentChanges, plan.target) !== input.fingerprint)
    throw new Error(tr('packUpgrade.changed'));
  const rollbackRoot = join(directory, 'rollback');
  const applied: { path: string; existed: boolean }[] = [];
  const replaced = new Map<string, string>();
  const previousStatus = instance.status;
  const previousError = instance.error;
  await host.store.update((draft) => {
    const current = draft.instances.find((entry) => entry.id === input.id);
    if (!current) throw new Error(tr('game.instanceNotFound'));
    current.status = 'error';
    current.error = tr('packUpgrade.interrupted', { id: backupId });
  });
  try {
    for (const change of changes) {
      task.signal.throwIfAborted();
      const choice = input.choices[change.path];
      if (
        change.protected ||
        choice === 'keep' ||
        (change.action === 'keep' && choice !== 'replace')
      )
        continue;
      const actualPath =
        change.disabledHash && !change.currentHash ? `${change.path}.disabled` : change.path;
      const existed = Boolean(change.currentHash || change.disabledHash);
      const target = await checkedPath(instance.directory, actualPath);
      const original = inside(rollbackRoot, actualPath);
      if (existed) {
        await mkdir(dirname(original), { recursive: true });
        await copyFile(target, original);
      }
      applied.push({ path: actualPath, existed });
      if (change.nextHash) {
        await mkdir(dirname(target), { recursive: true });
        const temporary = `${target}.${randomUUID()}.nixel-pack-update`;
        try {
          await copyFile(inside(filesRoot, change.path), temporary);
          await rename(temporary, target);
        } finally {
          await rm(temporary, { force: true });
        }
      } else await rm(target, { force: true });
      replaced.set(change.path, actualPath);
      task.report(65 + (applied.length / Math.max(changes.length, 1)) * 30, change.path);
    }
    task.signal.throwIfAborted();
    await host.store.update((draft) => {
      const current = draft.instances.find((entry) => entry.id === input.id);
      if (!current) throw new Error(tr('game.instanceNotFound'));
      Object.assign(current, plan.target, {
        launchVersion,
        modpack: next,
        status: 'ready',
        kind: plan.target.loader,
        error: undefined,
      });
      const replacedPaths = new Set(replaced.values());
      draft.content = draft.content.filter(
        (entry) =>
          entry.instance !== input.id ||
          !replacedPaths.has(`${contentDirectories[entry.category]}/${entry.fileName}`),
      );
      draft.content.push(
        ...contentRecords(
          input.id,
          content.filter((file) =>
            replaced.has(`${contentDirectories[file.category]}/${file.fileName}`),
          ),
        ).map((entry) =>
          replaced
            .get(`${contentDirectories[entry.category]}/${entry.fileName}`)
            ?.endsWith('.disabled')
            ? { ...entry, fileName: `${entry.fileName}.disabled`, enabled: false }
            : entry,
        ),
      );
      for (const entry of draft.content) if (entry.instance === input.id) delete entry.update;
    });
  } catch (error) {
    const failures: unknown[] = [error];
    for (const item of applied.reverse()) {
      try {
        const target = await checkedPath(instance.directory, item.path);
        if (item.existed) await copyFile(inside(rollbackRoot, item.path), target);
        else await rm(target, { force: true });
      } catch (failure) {
        failures.push(failure);
      }
    }
    if (failures.length > 1)
      throw new AggregateError(failures, tr('packUpgrade.rollbackFailed', { id: backupId }));
    await host.store.update((draft) => {
      const current = draft.instances.find((entry) => entry.id === input.id);
      if (current) {
        current.status = previousStatus;
        current.error = previousError;
      }
    });
    throw error;
  }
  try {
    await rm(rollbackRoot, { recursive: true, force: true });
  } catch (error) {
    task.log(
      tr('packUpgrade.cleanupFailed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
  task.report(100, tr('packUpgrade.completed'));
}
