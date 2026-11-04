import type { InstanceVersionPlan, InstanceVersionTarget } from '../../../shared/contracts';
import type { NixelHost } from '../../../shared/host-api';
import { tr } from '../../../shared/i18n';
import { assertInstanceIdle, getInstance } from '../../instance-state';
import { gameProvider } from './catalog';
import { reviewContent } from './compatibility';
import { contentState } from './content-state';

export async function planVersionChange(
  host: NixelHost,
  id: string,
  input: InstanceVersionTarget,
  signal?: AbortSignal,
  taskId?: string,
): Promise<InstanceVersionPlan> {
  assertInstanceIdle(host, id, taskId);
  const instance = structuredClone(getInstance(host, id));
  if (
    !input ||
    typeof input.version !== 'string' ||
    !['Vanilla', 'Fabric', 'Forge', 'NeoForge', 'Quilt'].includes(input.loader)
  )
    throw new Error(tr('versionChange.invalidTarget'));
  const target: InstanceVersionTarget = {
    version: input.version,
    loader: input.loader,
    loaderVersion: input.loader === 'Vanilla' ? undefined : input.loaderVersion,
  };
  if (
    instance.version === target.version &&
    instance.loader === target.loader &&
    instance.loaderVersion === target.loaderVersion
  )
    throw new Error(tr('versionChange.unchanged'));
  const provider = gameProvider(host, id);
  const versions = await provider.versions(signal);
  signal?.throwIfAborted();
  if (!versions.some((version) => version.id === target.version))
    throw new Error(tr('versionChange.invalidTarget'));
  if (target.loader !== 'Vanilla') {
    const loaders = await provider.loaders(target.version, target.loader, signal);
    signal?.throwIfAborted();
    if (!target.loaderVersion || !loaders.some((version) => version.id === target.loaderVersion))
      throw new Error(tr('versionChange.invalidLoader'));
  }
  const { entries, fingerprint } = await contentState(host, instance, target, signal);
  const proposed = { ...instance, ...target };
  const content = await reviewContent(host, proposed, entries, signal);
  signal?.throwIfAborted();
  return { target, fingerprint, content };
}
