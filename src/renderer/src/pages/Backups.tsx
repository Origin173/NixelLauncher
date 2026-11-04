import { useEffect, useState } from 'react';
import type { Instance, InstanceBackup } from '../../../shared/contracts';
import { i18n, tr } from '../../../shared/i18n';
import { useApp } from '../state';
import { Action, Empty, Heading, IconButton, Notice } from '../ui';

export function Backups({ instance }: { instance?: Instance }) {
  const a = useApp();
  const [items, setItems] = useState<InstanceBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState(false);
  const taskRevision = a.tasks
    .filter(
      (task) =>
        task.kind === 'backup' || task.kind === 'version-change' || task.kind === 'pack-upgrade',
    )
    .map((task) => `${task.id}:${task.status}`)
    .join(',');
  const busy =
    instance &&
    (instance.status === 'installing' ||
      a.running.includes(instance.id) ||
      a.tasks.some((task) => task.instanceId === instance.id && task.status === 'running'));

  // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh after backup tasks change or the user reloads the list.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    window.nixel
      .invoke<InstanceBackup[]>('backups.list', { instanceId: instance?.id })
      .then((result) => {
        if (active) setItems(result);
      })
      .catch((error: Error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [instance?.id, refresh, taskRevision]);

  async function start(command: string, params: Record<string, string>) {
    setPending(true);
    try {
      if (await a.command(command, params)) a.setTaskOpen(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack">
      <Heading title={tr(instance ? 'backups.title' : 'backups.allBackups')}>
        <IconButton
          icon="refresh"
          label={tr('backups.refresh')}
          onPress={() => setRefresh((value) => value + 1)}
        />
        {instance && (
          <Action
            icon="plus"
            size="sm"
            isDisabled={Boolean(busy) || pending}
            onPress={() => void start('backups.create', { instanceId: instance.id })}
          >
            {tr('backups.create')}
          </Action>
        )}
      </Heading>
      <p className="micro">{tr('backups.scope')}</p>
      {error ? (
        <Notice tone="danger">{error}</Notice>
      ) : loading ? (
        <p className="micro" role="status">
          {tr('backups.loading')}
        </p>
      ) : items.length ? (
        <ul className="backup-list" aria-label={tr('backups.title')}>
          {items.map((backup) => {
            const restoring = a.tasks.some(
              (task) =>
                task.kind === 'restore' &&
                task.resourceId === backup.id &&
                task.status === 'running',
            );
            const date = new Date(backup.createdAt).toLocaleString(i18n.language);
            return (
              <li className="content-row" key={backup.id}>
                <div className="flex-1">
                  <strong>{instance ? date : backup.instanceName}</strong>
                  {!instance && <small>{date}</small>}
                  <small>
                    {tr(
                      backup.origin === 'modpack-upgrade'
                        ? 'backupRetention.modpack'
                        : backup.origin === 'version-change'
                          ? 'backupRetention.automatic'
                          : 'backupRetention.manual',
                    )}
                  </small>
                  <small>
                    {tr('backups.summary', {
                      version: backup.version,
                      loader: backup.loader,
                      size: formatSize(backup.size),
                      files: backup.files,
                    })}
                  </small>
                </div>
                <Action
                  icon="copy"
                  size="sm"
                  variant="secondary"
                  isDisabled={restoring || pending}
                  onPress={() => void start('backups.restore', { id: backup.id })}
                >
                  {tr(restoring ? 'backups.restoring' : 'backups.restore')}
                </Action>
                <IconButton
                  icon="trash"
                  label={tr('backups.delete')}
                  isDisabled={restoring || pending}
                  onPress={() =>
                    a.setOverlay({
                      type: 'confirm',
                      title: tr('backups.delete'),
                      detail: tr('backups.deleteDetail', { name: backup.instanceName, date }),
                      action: async () => {
                        await window.nixel.invoke('backups.delete', { id: backup.id });
                        setRefresh((value) => value + 1);
                      },
                    })
                  }
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty
          title={tr('backups.empty')}
          detail={tr(instance ? 'backups.emptyInstance' : 'backups.emptyAll')}
        />
      )}
    </div>
  );
}

function formatSize(bytes: number) {
  const divisor = bytes >= 1024 ** 3 ? 1024 ** 3 : 1024 ** 2;
  const size = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(
    bytes / divisor,
  );
  return `${size} ${divisor === 1024 ** 3 ? 'GB' : 'MB'}`;
}
