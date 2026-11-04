import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NixelHost, TaskContext } from '../../shared/host-api';
import { tr } from '../../shared/i18n';
import type {
  ModpackState,
  ModpackUpgradePlan,
  ModpackUpgradeTarget,
  PackProvenance,
} from '../../shared/modpack-contracts';
import { assertInstanceIdle, getInstance } from '../instance-state';
import type { ResourceProvider } from '../providers';
import type { ContentDownload } from '../resource-files';
import { readPack } from './archive';
import { comparePack, planFingerprint } from './diff';
import { captureBaseline, materializePack } from './materialize';
export interface PreparedUpgrade {
  plan: ModpackUpgradePlan;
  next: ModpackState;
  content: ContentDownload[];
}
export function upgradeDirectory(host: NixelHost, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error(tr('packUpgrade.expired'));
  return join(host.store.cacheRoot, 'pack-upgrades', id);
}
export async function readPrepared(host: NixelHost, id: string): Promise<PreparedUpgrade> {
  const raw = await readFile(join(upgradeDirectory(host, id), 'plan.json'), 'utf8').catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') throw new Error(tr('packUpgrade.expired'));
      throw error;
    },
  );
  return JSON.parse(raw) as PreparedUpgrade;
}
export async function prepareUpgrade(
  host: NixelHost,
  input: ModpackUpgradeTarget,
  provenance: PackProvenance | undefined,
  planId: string,
  task: TaskContext,
) {
  if (input.path && input.versionId) throw new Error(tr('packUpgrade.chooseArchive'));
  assertInstanceIdle(host, input.id, task.taskId);
  const instance = getInstance(host, input.id);
  if (!instance.modpack) throw new Error(tr('packUpgrade.noBaseline'));
  const directory = upgradeDirectory(host, planId);
  await rm(directory, { recursive: true, force: true });
  let archive = input.path;
  let downloaded = false;
  try {
    if (!archive) {
      if (!provenance) throw new Error(tr('packUpgrade.chooseArchive'));
      const provider = host.providers.get<ResourceProvider>('resources', provenance.source);
      if (!provider.downloadModpack) throw new Error(tr('packUpgrade.unsupported'));
      archive = await provider.downloadModpack(provenance.projectId, provenance.versionId, task);
      downloaded = true;
    }
    const pack = await readPack(host, archive);
    try {
      if ((pack.curseForgeFiles ? 'curseforge' : 'modrinth') !== instance.modpack.format)
        throw new Error(tr('packUpgrade.formatChanged'));
      const filesRoot = join(directory, 'files');
      await mkdir(filesRoot, { recursive: true });
      const files = await materializePack(
        pack,
        { ...instance, ...pack.target, directory: filesRoot },
        task,
      );
      const next = await captureBaseline(pack, filesRoot, files, provenance, task.signal);
      const changes = await comparePack(instance, next, task.signal);
      const plan: ModpackUpgradePlan = {
        id: planId,
        instanceId: instance.id,
        name: next.name,
        version: next.version,
        target: pack.target,
        changes,
        fingerprint: planFingerprint(instance, changes, pack.target),
      };
      await writeFile(
        join(directory, 'plan.json'),
        JSON.stringify({ plan, next, content: files.content } satisfies PreparedUpgrade),
      );
      task.report(100, tr('packUpgrade.ready'));
    } finally {
      pack.zip.close();
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  } finally {
    if (downloaded && archive) await rm(archive, { force: true });
  }
}
export const newPlanId = () => randomUUID();
