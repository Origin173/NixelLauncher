import type { Context } from 'cordis';
import { tr } from '../../shared/i18n';
import type { AppearanceChange } from '../../shared/skins';
import { commandsFor } from '../commands';
import type { AccountProvider } from '../providers';
import { readSkinFile } from './png';

export const skinsPlugin = {
  name: 'nixel.skins',
  inject: ['nixel'],
  apply(ctx: Context) {
    const host = ctx.nixel;
    const command = commandsFor(ctx);
    const pending = new Map<string, AbortController>();
    ctx.effect(() => () => {
      for (const controller of pending.values()) controller.abort();
    });
    function accountProvider(accountId: string) {
      const account = host.store.read().accounts.find((entry) => entry.id === accountId);
      if (!account) throw new Error(tr('accounts.accountNotFound'));
      const appearance = host.providers.get<AccountProvider>(
        'accounts',
        account.provider,
      ).appearance;
      if (!appearance) throw new Error(tr('skins.unsupported'));
      return { account, appearance };
    }
    command(
      'skins.profile',
      async ({ accountId, requestId }: { accountId: string; requestId: string }) => {
        const { account, appearance } = accountProvider(accountId);
        if (typeof requestId !== 'string' || !/^[\w-]{1,80}$/.test(requestId))
          throw new Error(tr('skins.invalidProfile'));
        pending.get(requestId)?.abort();
        const controller = new AbortController();
        pending.set(requestId, controller);
        try {
          return await appearance.profile(account, controller.signal);
        } finally {
          if (pending.get(requestId) === controller) pending.delete(requestId);
        }
      },
    );
    command('skins.cancel', ({ requestId }: { requestId: string }) => {
      pending.get(requestId)?.abort();
    });
    command('skins.file', async ({ path }: { path: string }) => {
      const { bytes: _, ...file } = await readSkinFile(path);
      return file;
    });
    command(
      'skins.change',
      ({ accountId, change }: { accountId: string; change: AppearanceChange }) => {
        const { account } = accountProvider(accountId);
        if (!change || !['upload', 'reset', 'cape'].includes(change.kind))
          throw new Error(tr('skins.invalidProfile'));
        if (change.kind === 'upload') {
          if (!['classic', 'slim'].includes(change.model))
            throw new Error(tr('skins.invalidModel'));
          if (typeof change.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(change.sha256))
            throw new Error(tr('skins.fileChanged'));
        }
        if (
          change.kind === 'cape' &&
          change.capeId !== null &&
          (typeof change.capeId !== 'string' || !change.capeId)
        )
          throw new Error(tr('skins.capeNotOwned'));
        if (
          host.tasks
            .list()
            .some(
              (task) =>
                task.kind === 'skin-update' &&
                task.resourceId === accountId &&
                task.status === 'running',
            )
        )
          throw new Error(tr('skins.busy'));
        return {
          taskId: host.tasks.start(
            tr('skins.updating', { name: account.name }),
            tr('skins.preparing'),
            async (task) => {
              const { account: current, appearance } = accountProvider(accountId);
              if (change.kind === 'upload') {
                const file = await readSkinFile(change.path, task.signal);
                if (file.sha256 !== change.sha256) throw new Error(tr('skins.fileChanged'));
                task.report(20, tr('skins.uploading'));
                await appearance.upload(current, file.bytes, change.model, task.signal);
              } else {
                task.report(0, tr('skins.uploading'));
                if (change.kind === 'reset') await appearance.reset(current, task.signal);
                else await appearance.cape(current, change.capeId, task.signal);
              }
              task.report(100, tr('skins.updated'));
            },
            {
              kind: 'skin-update',
              resourceId: accountId,
              resourceSource: account.provider,
              retry: { command: 'skins.change', params: { accountId, change } },
            },
          ),
        };
      },
    );
  },
};
