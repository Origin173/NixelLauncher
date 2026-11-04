import { homedir } from 'node:os';
import { serviceEnvironment } from '../../host/service-environment';
import type { NixelHost } from '../../shared/host-api';
import { redactLog } from '../launch-logs';

/** Secrets are consumed only by this closure; they never become report metadata. */
export async function diagnosticRedactor(host: NixelHost, instanceDirectory: string) {
  const replacements = new Map<string, string>();
  const add = (value: string, replacement: string) => {
    if (value.length < 4) return;
    replacements.set(value, replacement);
    replacements.set(value.replaceAll('\\', '/'), replacement);
    replacements.set(encodeURIComponent(value), replacement);
    replacements.set(JSON.stringify(value).slice(1, -1), replacement);
  };
  for (const value of Object.values(serviceEnvironment)) add(value, '[REDACTED]');
  function secrets(value: unknown) {
    if (typeof value === 'string') add(value, '[REDACTED]');
    else if (value && typeof value === 'object')
      for (const item of Object.values(value)) secrets(item);
  }
  for (const account of host.store.read().accounts) {
    const stored = await host.platform.secretGet(`account:${account.id}`);
    if (stored) secrets(JSON.parse(stored));
    add(account.uuid, '[PLAYER]');
    add(account.uuid.replaceAll('-', ''), '[PLAYER]');
    add(account.name, '[PLAYER]');
  }
  add(instanceDirectory, '[INSTANCE]');
  add(host.store.root, '[DATA]');
  add(homedir(), '[HOME]');
  const literals = [...replacements].sort((a, b) => b[0].length - a[0].length);
  return (text: string) => {
    for (const [value, replacement] of literals) text = text.replaceAll(value, replacement);
    return redactLog(text)
      .replace(
        /^Environment Variables:\r?\n(?:[^\r\n]+\r?\n)*/gim,
        'Environment Variables: [REDACTED]\n',
      )
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '[ADDRESS]')
      .replace(/(?:[A-Z]:[\\/]Users[\\/]|\/home\/|\/Users\/)[^\\/\s]+/gi, '[HOME]');
  };
}
