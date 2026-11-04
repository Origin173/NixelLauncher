import { createHash } from 'node:crypto';
import type { Instance } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import type {
  ModpackFileChange,
  ModpackState,
  ModpackUpgradePlan,
} from '../../shared/modpack-contracts';
import { checkedPath } from '../file-transaction';
import { hashFile } from '../files';

export { checkedPath } from '../file-transaction';

async function currentFile(root: string, path: string, signal?: AbortSignal) {
  const target = await checkedPath(root, path);
  return hashFile(target, 'sha256', signal).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
}
export async function comparePack(instance: Instance, next: ModpackState, signal?: AbortSignal) {
  if (!instance.modpack) throw new Error(tr('packUpgrade.noBaseline'));
  const before = new Map(instance.modpack.files.map((file) => [file.path, file.sha256]));
  const after = new Map(next.files.map((file) => [file.path, file.sha256]));
  const previousCase = new Map([...before.keys()].map((path) => [path.toLowerCase(), path]));
  for (const path of after.keys()) {
    const previous = previousCase.get(path.toLowerCase());
    if (previous && previous !== path) throw new Error(tr('packUpgrade.caseChanged', { path }));
  }
  const changes: ModpackFileChange[] = [];
  for (const path of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    signal?.throwIfAborted();
    const oldHash = before.get(path),
      nextHash = after.get(path);
    const currentHash = await currentFile(instance.directory, path, signal);
    const protectedPath = /^(saves|screenshots)\//i.test(path);
    const userConfig = /^(config|defaultconfigs)\/|^(options[^/]*\.txt|servers\.dat)$/i.test(path);
    let action: ModpackFileChange['action'];
    if (protectedPath || currentHash === nextHash || oldHash === nextHash) action = 'keep';
    else if (currentHash !== oldHash || (userConfig && currentHash !== undefined))
      action = 'conflict';
    else action = !nextHash ? 'remove' : !oldHash ? 'add' : 'replace';
    const disabledHash = /^(mods|resourcepacks|shaderpacks)\//.test(path)
      ? await currentFile(instance.directory, `${path}.disabled`, signal)
      : undefined;
    if (disabledHash && oldHash !== nextHash && currentHash === undefined) action = 'conflict';
    changes.push({ path, action, currentHash, nextHash, protected: protectedPath, disabledHash });
  }
  return changes;
}
export function planFingerprint(
  instance: Instance,
  changes: ModpackFileChange[],
  target: ModpackUpgradePlan['target'],
) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        baseline: instance.modpack,
        version: instance.version,
        loader: instance.loader,
        loaderVersion: instance.loaderVersion,
        providers: instance.providers,
        changes,
        target,
      }),
    )
    .digest('hex');
}
