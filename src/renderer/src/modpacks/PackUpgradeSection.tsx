import type { Instance } from '../../../shared/contracts';
import { tr } from '../../../shared/i18n';
import { useApp } from '../state';
import { Action, Group, SettingRow } from '../ui';

export function PackUpgradeSection({ instance }: { instance: Instance }) {
  const a = useApp();
  const busy =
    a.running.includes(instance.id) ||
    a.tasks.some((task) => task.instanceId === instance.id && task.status === 'running');
  if (!instance.modpack) return null;
  return (
    <Group title={instance.modpack.name}>
      <SettingRow title={tr('packUpgrade.version')}>
        <span>
          {instance.modpack.provenance
            ? a.providers.find((provider) => provider.id === instance.modpack?.provenance?.source)
                ?.name || instance.modpack.provenance.source
            : tr('packUpgrade.localSource')}{' '}
          · {instance.modpack.version}
        </span>
        <Action
          size="sm"
          variant="secondary"
          isDisabled={busy}
          onPress={() => a.setOverlay({ type: 'pack-upgrade', instanceId: instance.id })}
        >
          {tr('packUpgrade.title')}
        </Action>
      </SettingRow>
    </Group>
  );
}
