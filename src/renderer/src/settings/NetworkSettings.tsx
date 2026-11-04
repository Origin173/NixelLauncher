import { useEffect, useState } from 'react';
import { tr } from '../../../shared/i18n';
import { defaultNetworkConfiguration, type ProxyMode } from '../../../shared/network';
import { useApp } from '../state';
import { Action, Check, Choice, Field, Group, SettingRow } from '../ui';

export function NetworkSettings() {
  const a = useApp();
  const plugin = a.plugins.find((entry) => entry.id === 'nixel.network');
  const savedMode = (plugin?.config.mode as ProxyMode) ?? defaultNetworkConfiguration.mode;
  const savedUrl = (plugin?.config.proxyUrl as string) ?? '';
  const savedUsername = (plugin?.config.username as string) ?? '';
  const savedCredential = (plugin?.config.credentialId as string) ?? '';
  const [mode, setMode] = useState(savedMode);
  const [proxyUrl, setProxyUrl] = useState(savedUrl);
  const [saving, setSaving] = useState(false);
  const [authentication, setAuthentication] = useState(Boolean(savedCredential));
  const [username, setUsername] = useState(savedUsername);
  const [password, setPassword] = useState('');
  useEffect(() => {
    setMode(savedMode);
    setProxyUrl(savedUrl);
    setAuthentication(Boolean(savedCredential));
    setUsername(savedUsername);
    setPassword('');
  }, [savedMode, savedUrl, savedUsername, savedCredential]);
  if (plugin?.status !== 'active') return null;
  const checking = a.tasks.some((task) => task.kind === 'network' && task.status === 'running');
  const changed =
    mode !== savedMode ||
    (mode === 'custom' &&
      (proxyUrl.trim() !== savedUrl ||
        authentication !== Boolean(savedCredential) ||
        (authentication && (username !== savedUsername || Boolean(password)))));
  return (
    <Group title={tr('network.title')}>
      <SettingRow title={tr('network.mode')}>
        <Choice
          label={tr('network.mode')}
          value={mode}
          onChange={(value) => setMode(value as ProxyMode)}
          options={(['system', 'direct', 'custom'] as const).map((id) => ({
            id,
            name: tr(`network.${id}`),
          }))}
        />
      </SettingRow>
      {mode === 'custom' && (
        <div className="stack">
          <Field
            label={tr('network.url')}
            value={proxyUrl}
            onChange={setProxyUrl}
            placeholder="http://127.0.0.1:7890"
          />
          <Check
            label={tr('proxyAuth.enabled')}
            value={authentication}
            onChange={setAuthentication}
          />
          {authentication && (
            <>
              <Field label={tr('proxyAuth.username')} value={username} onChange={setUsername} />
              <Field
                label={tr('proxyAuth.password')}
                type="password"
                value={password}
                onChange={setPassword}
                placeholder={
                  savedCredential && proxyUrl.trim() === savedUrl && username === savedUsername
                    ? tr('proxyAuth.savedPassword')
                    : tr('proxyAuth.newPassword')
                }
              />
            </>
          )}
          <p className="micro">{tr('proxyAuth.hint')}</p>
        </div>
      )}
      <p className="micro">{tr('network.hint')}</p>
      <div className="row">
        <Action
          size="sm"
          isDisabled={saving || !changed || (mode === 'custom' && !proxyUrl.trim())}
          onPress={async () => {
            setSaving(true);
            try {
              if (
                await a.command('network.configure', {
                  mode,
                  proxyUrl,
                  authentication: mode === 'custom' && authentication,
                  username,
                  password,
                })
              )
                setPassword('');
            } finally {
              setSaving(false);
            }
          }}
        >
          {tr('network.save')}
        </Action>
        <Action
          size="sm"
          variant="secondary"
          isDisabled={saving || changed || checking}
          onPress={async () => {
            if (await a.command('network.check')) a.setTaskOpen(true);
          }}
        >
          {tr('network.check')}
        </Action>
      </div>
    </Group>
  );
}
