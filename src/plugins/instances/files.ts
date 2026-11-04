import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Context } from 'cordis';
import type { InstanceFile } from '../../shared/contracts';
import { tr } from '../../shared/i18n';
import { commandsFor } from '../commands';
import { getInstance } from '../instance-state';
import { recentLaunchLog, redactLog } from '../launch-logs';

export function registerInstanceFiles(ctx: Context) {
  const host = ctx.nixel;
  const command = commandsFor(ctx);
  command('instances.logs', async ({ id }: { id: string }) => {
    const recent = recentLaunchLog(id);
    if (recent) return recent;
    const directory = getInstance(host, id).directory;
    let text = await readFile(join(directory, 'nixel-launch.log'), 'utf8').catch(() =>
      readFile(join(directory, 'logs/latest.log'), 'utf8').catch(() => ''),
    );
    for (const account of host.store.read().accounts) {
      const stored = await host.platform.secretGet(`account:${account.id}`);
      if (stored)
        for (const token of Object.values(JSON.parse(stored) as Record<string, unknown>))
          if (typeof token === 'string' && token.length > 16)
            text = text.replaceAll(token, '[REDACTED]');
    }
    return redactLog(text).split(/\r?\n/).slice(-2000);
  });
  command(
    'instances.files',
    async ({ id, kind }: { id: string; kind: 'saves' | 'screenshots' | 'crash-reports' }) => {
      if (kind !== 'saves' && kind !== 'screenshots' && kind !== 'crash-reports')
        throw new Error(tr('game.unsupportedFileType'));
      const directory = join(getInstance(host, id).directory, kind);
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
      return Promise.all(
        entries
          .filter((entry) => !entry.isSymbolicLink())
          .map(async (entry): Promise<InstanceFile> => {
            const path = join(directory, entry.name);
            const info = await stat(path);
            return {
              name: entry.name,
              path,
              size: info.size,
              modifiedAt: info.mtime.toISOString(),
            };
          }),
      );
    },
  );
}
