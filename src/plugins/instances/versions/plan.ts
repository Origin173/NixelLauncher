import { createHash } from 'node:crypto';
import type { InstanceVersionPlan, InstanceVersionTarget } from '../../../shared/contracts';
import type { NixelHost } from '../../../shared/host-api';
import { tr } from '../../../shared/i18n';
import { assertInstanceIdle, getInstance } from '../../instance-state';
import { scanContent } from '../../resource-files';
import { gameProvider } from './catalog';
import { reviewContent } from './compatibility';

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
  const entries = (await scanContent(host, instance)).sort((a, b) => a.id.localeCompare(b.id));
  const proposed = { ...instance, ...target };
  const content = await reviewContent(host, proposed, entries, signal);
  signal?.throwIfAborted();
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        target,
        current: {
          version: instance.version,
          loader: instance.loader,
          loaderVersion: instance.loaderVersion,
          launchVersion: instance.launchVersion,
          providers: instance.providers,
          providerConfig: instance.providerConfig,
        },
        content: entries.map((entry, index) => ({
          id: entry.id,
          file: entry.fileName,
          category: entry.category,
          enabled: entry.enabled,
          source: entry.source,
          project: entry.projectId,
          version: entry.versionId,
          status: content[index]?.status,
        })),
      }),
    )
    .digest('hex');
  return { target, fingerprint, content };
}
