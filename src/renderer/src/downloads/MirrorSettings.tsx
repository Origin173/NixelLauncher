import { useEffect, useState } from 'react';
import {
  type DownloadMirrorConfiguration,
  defaultDownloadMirror,
} from '../../../shared/download-mirrors';
import { downloadsId } from '../../../shared/downloads';
import { tr } from '../../../shared/i18n';
import { useApp } from '../state';
import { Action, Choice, Field, Group, SettingRow } from '../ui';

export function MirrorSettings() {
  const a = useApp();
  const plugin = a.plugins.find((entry) => entry.id === downloadsId);
  const saved =
    (plugin?.config.mirror as DownloadMirrorConfiguration | undefined) ?? defaultDownloadMirror;
  const [mode, setMode] = useState(saved.mode);
  const [baseUrl, setBaseUrl] = useState(saved.baseUrl);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setMode(saved.mode);
    setBaseUrl(saved.baseUrl);
  }, [saved.mode, saved.baseUrl]);
  if (plugin?.status !== 'active') return null;
  const changed = mode !== saved.mode || (mode === 'custom' && baseUrl.trim() !== saved.baseUrl);
  const busy = a.running.length > 0 || a.tasks.some((task) => task.status === 'running');
  return (
    <Group title={tr('mirrors.title')}>
      <SettingRow title={tr('mirrors.source')}>
        <Choice
          label={tr('mirrors.source')}
          value={mode}
          onChange={(value) => setMode(value as DownloadMirrorConfiguration['mode'])}
          options={(['official', 'bmclapi', 'custom'] as const).map((id) => ({
            id,
            name: tr(`mirrors.${id}`),
          }))}
        />
      </SettingRow>
      {mode === 'custom' && (
        <Field
          label={tr('mirrors.origin')}
          value={baseUrl}
          onChange={setBaseUrl}
          placeholder="https://mirror.example.org"
        />
      )}
      <p className="micro">{tr('mirrors.scope')}</p>
      <Action
        size="sm"
        isDisabled={saving || busy || !changed || (mode === 'custom' && !baseUrl.trim())}
        onPress={async () => {
          setSaving(true);
          try {
            await a.command('downloads.configure', { mirror: { mode, baseUrl: baseUrl.trim() } });
          } finally {
            setSaving(false);
          }
        }}
      >
        {tr('mirrors.save')}
      </Action>
    </Group>
  );
}
