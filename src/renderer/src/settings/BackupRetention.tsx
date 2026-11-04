import { useEffect, useState } from 'react';
import { tr } from '../../../shared/i18n';
import { useApp } from '../state';
import { Action, Field, Group } from '../ui';

export function BackupRetention() {
  const a = useApp();
  const saved = a.settings.backupRetentionCount;
  const [value, setValue] = useState(String(saved));
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(String(saved)), [saved]);
  const count = Number(value);
  const valid = value.trim() !== '' && Number.isInteger(count) && count >= 0 && count <= 1000;
  return (
    <Group title={tr('backupRetention.title')}>
      <p className="micro">{tr('backupRetention.description')}</p>
      <Field
        label={tr('backupRetention.count')}
        type="number"
        value={value}
        onChange={setValue}
        error={valid ? undefined : tr('backupRetention.invalidCount')}
      />
      <Action
        size="sm"
        isDisabled={!valid || saving || count === saved}
        onPress={async () => {
          setSaving(true);
          try {
            await a.updateSettings({ backupRetentionCount: count });
          } finally {
            setSaving(false);
          }
        }}
      >
        {tr('backupRetention.save')}
      </Action>
    </Group>
  );
}
