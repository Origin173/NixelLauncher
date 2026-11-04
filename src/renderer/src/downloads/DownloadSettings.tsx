import { useEffect, useState } from 'react';
import { downloadsId } from '../../../shared/downloads';
import { tr } from '../../../shared/i18n';
import { useApp } from '../state';
import { Action, Field, Group } from '../ui';

export function DownloadSettings() {
  const a = useApp();
  const plugin = a.plugins.find((entry) => entry.id === downloadsId);
  const savedConcurrency = Number(plugin?.config.concurrency ?? a.settings.downloadConcurrency);
  const savedLimit = Number(plugin?.config.bytesPerSecond ?? 0) / 1024;
  const [concurrency, setConcurrency] = useState(String(savedConcurrency));
  const [limit, setLimit] = useState(String(savedLimit));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setConcurrency(String(savedConcurrency));
    setLimit(String(savedLimit));
  }, [savedConcurrency, savedLimit]);
  if (plugin?.status !== 'active') return null;
  const count = Number(concurrency);
  const speed = Number(limit);
  const valid =
    concurrency.trim() !== '' &&
    limit.trim() !== '' &&
    Number.isInteger(count) &&
    count >= 1 &&
    count <= 32 &&
    Number.isInteger(speed) &&
    speed >= 0 &&
    speed <= 1048576;
  const busy = a.running.length > 0 || a.tasks.some((task) => task.status === 'running');
  return (
    <Group title={tr('downloads.title')}>
      <Field
        type="number"
        label={tr('downloads.concurrency')}
        value={concurrency}
        onChange={setConcurrency}
      />
      <Field
        type="number"
        label={tr('downloads.limit')}
        value={limit}
        onChange={setLimit}
        error={valid ? undefined : tr('downloads.invalidConfiguration')}
      />
      <p className="micro">{tr('downloads.hint')}</p>
      <Action
        size="sm"
        isDisabled={
          !valid || busy || saving || (count === savedConcurrency && speed === savedLimit)
        }
        onPress={async () => {
          setSaving(true);
          try {
            await a.command('downloads.configure', {
              concurrency: count,
              bytesPerSecond: speed * 1024,
            });
          } finally {
            setSaving(false);
          }
        }}
      >
        {tr('downloads.save')}
      </Action>
    </Group>
  );
}
