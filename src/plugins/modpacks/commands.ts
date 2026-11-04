import type { Context } from 'cordis';
import { tr } from '../../shared/i18n';
import type { ModpackUpgradeInput, ModpackUpgradeTarget } from '../../shared/modpack-contracts';
import { commandsFor } from '../commands';
import { assertInstanceIdle, getInstance } from '../instance-state';
import type { BackupRepository } from '../instances/backups/repository';
import type { ResourceProvider } from '../providers';
import { applyUpgrade } from './apply';
import { newPlanId, prepareUpgrade, readPrepared } from './prepare';
export function registerUpgrade(ctx: Context, backups: BackupRepository) {
  const host = ctx.nixel,
    command = commandsFor(ctx);
  command('modpacks.versions', async ({ id }: { id: string }) => {
    const source = getInstance(host, id).modpack?.provenance;
    return source
      ? host.providers.get<ResourceProvider>('resources', source.source).versions(source.projectId)
      : [];
  });
  command('modpacks.prepareUpgrade', (input: ModpackUpgradeTarget) => {
    assertInstanceIdle(host, input.id);
    const currentSource = getInstance(host, input.id).modpack?.provenance;
    if (
      input.source !== undefined &&
      (!input.versionId ||
        !input.source ||
        !currentSource ||
        currentSource.source !== input.source.source ||
        currentSource.projectId !== input.source.projectId)
    )
      throw new Error(tr('packUpgrade.changed'));
    const provenance =
      input.versionId && currentSource
        ? { ...currentSource, versionId: input.versionId }
        : undefined;
    const planId = newPlanId();
    return {
      planId,
      taskId: host.tasks.start(
        tr('packUpgrade.prepare'),
        tr('packUpgrade.preparing'),
        async (task) => {
          await prepareUpgrade(host, input, provenance, planId, task);
          return { resultId: planId };
        },
        {
          instanceId: input.id,
          kind: 'pack-prepare',
          retry: {
            command: 'modpacks.prepareUpgrade',
            params: {
              id: input.id,
              path: input.path,
              versionId: input.versionId,
              source: provenance && { source: provenance.source, projectId: provenance.projectId },
            },
          },
        },
      ),
    };
  });
  command(
    'modpacks.upgradePlan',
    async ({ planId }: { planId: string }) => (await readPrepared(host, planId)).plan,
  );
  command('modpacks.upgrade', (input: ModpackUpgradeInput) => {
    assertInstanceIdle(host, input.id);
    return {
      taskId: host.tasks.start(
        tr('packUpgrade.title'),
        tr('packUpgrade.preparing'),
        (task) => applyUpgrade(host, backups, input, task),
        {
          instanceId: input.id,
          kind: 'pack-upgrade',
          retry: { command: 'modpacks.upgrade', params: { ...input } },
        },
      ),
    };
  });
}
