import { Card } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import type { Instance } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/error-message';
import { i18n, tr } from '../../../shared/i18n';
import type { SavedServer, ServerStatus } from '../../../shared/servers';
import { useApp } from '../state';
import { Action, Dialog, Empty, Field, Heading, Notice, Tag } from '../ui';

export function Servers({ instance }: { instance: Instance }) {
  const a = useApp();
  const [editing, setEditing] = useState<SavedServer | 'new' | null>(null);
  const enabled = a.plugins.some(
    (plugin) => plugin.id === 'nixel.servers' && plugin.status === 'active',
  );
  if (!enabled) return <Notice>{tr('servers.disabled')}</Notice>;
  return (
    <div className="stack">
      <Heading title={tr('servers.title')}>
        <Action icon="plus" onPress={() => setEditing('new')}>
          {tr('servers.add')}
        </Action>
      </Heading>
      <p className="muted">{tr('servers.hint')}</p>
      {instance.status !== 'ready' && <Notice>{tr('servers.installFirst')}</Notice>}
      {instance.servers?.length ? (
        instance.servers.map((server) => (
          <ServerRow
            key={`${server.id}-${server.address}`}
            instance={instance}
            server={server}
            onEdit={() => setEditing(server)}
          />
        ))
      ) : (
        <Empty title={tr('servers.empty')} />
      )}
      {editing && (
        <ServerEditor
          key={typeof editing === 'string' ? editing : editing.id}
          instanceId={instance.id}
          server={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ServerRow({
  instance,
  server,
  onEdit,
}: {
  instance: Instance;
  server: SavedServer;
  onEdit: () => void;
}) {
  const a = useApp();
  const [status, setStatus] = useState<ServerStatus>();
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const request = useRef('');
  useEffect(
    () => () => {
      const requestId = request.current;
      request.current = '';
      if (requestId) void a.command('servers.cancel', { requestId });
    },
    [a.command],
  );
  const refresh = async () => {
    const requestId = crypto.randomUUID();
    request.current = requestId;
    setChecking(true);
    setStatus(undefined);
    setError('');
    try {
      const result = await window.nixel.invoke<ServerStatus>('servers.status', {
        instanceId: instance.id,
        id: server.id,
        requestId,
      });
      if (request.current === requestId) setStatus(result);
    } catch (error) {
      if (request.current === requestId) setError(errorMessage(error));
    } finally {
      if (request.current === requestId) {
        request.current = '';
        setChecking(false);
      }
    }
  };
  const busy =
    a.running.includes(instance.id) ||
    a.tasks.some((task) => task.instanceId === instance.id && task.status === 'running');
  const supported = a.providers.some(
    (provider) =>
      provider.kind === 'game' &&
      provider.id === instance.providers.game &&
      provider.capabilities?.includes('server-join'),
  );
  return (
    <Card className="padded stack-tight">
      <div className="row spread">
        <div>
          <strong>{server.name}</strong>
          <p className="micro mono">{server.address}</p>
        </div>
        <Action
          size="sm"
          icon="play"
          isDisabled={busy || instance.status !== 'ready' || !supported}
          onPress={() => a.launch(instance.id, undefined, server.address)}
        >
          {tr('servers.join')}
        </Action>
      </div>
      {!supported && <Notice>{tr('servers.unsupported')}</Notice>}
      {status ? (
        <>
          <p style={{ whiteSpace: 'pre-wrap' }}>{status.description}</p>
          <div className="row">
            <Tag>{status.version}</Tag>
            <span className="micro">
              {tr('servers.players', {
                online: status.online,
                maximum: status.maximum,
                latency: status.latency,
              })}
            </span>
            <time className="micro muted" dateTime={status.checkedAt}>
              {new Date(status.checkedAt).toLocaleTimeString(i18n.language)}
            </time>
          </div>
        </>
      ) : (
        <p className="micro muted">
          {checking
            ? tr('servers.checking')
            : error
              ? tr('servers.failed', { message: error })
              : tr('servers.unchecked')}
        </p>
      )}
      <div className="row">
        <Action
          size="sm"
          variant="secondary"
          icon="refresh"
          isDisabled={checking}
          onPress={() => void refresh()}
        >
          {tr('servers.refresh')}
        </Action>
        {checking && (
          <Action
            size="sm"
            variant="ghost"
            onPress={() => void a.command('servers.cancel', { requestId: request.current })}
          >
            {tr('servers.cancel')}
          </Action>
        )}
        <Action size="sm" variant="ghost" onPress={onEdit}>
          {tr('servers.edit')}
        </Action>
        <Action
          size="sm"
          variant="ghost"
          icon="trash"
          onPress={() =>
            a.setOverlay({
              type: 'confirm',
              title: tr('servers.delete'),
              detail: tr('servers.deleteDetail', { name: server.name }),
              action: () =>
                window.nixel.invoke('servers.delete', { instanceId: instance.id, id: server.id }),
            })
          }
        >
          {tr('servers.delete')}
        </Action>
      </div>
    </Card>
  );
}

function ServerEditor({
  instanceId,
  server,
  onClose,
}: {
  instanceId: string;
  server?: SavedServer;
  onClose: () => void;
}) {
  const [name, setName] = useState(server?.name ?? '');
  const [address, setAddress] = useState(server?.address ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await window.nixel.invoke('servers.save', { instanceId, id: server?.id, name, address });
      onClose();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr(server ? 'servers.edit' : 'servers.add')}
      footer={
        <>
          <Action variant="secondary" onPress={onClose}>
            {tr('servers.cancel')}
          </Action>
          <Action
            isDisabled={saving || !name.trim() || !address.trim()}
            onPress={() => void save()}
          >
            {tr('servers.save')}
          </Action>
        </>
      }
    >
      <div className="stack">
        <Field label={tr('servers.name')} value={name} onChange={setName} />
        <Field
          label={tr('servers.address')}
          value={address}
          onChange={setAddress}
          placeholder="play.example.com:25565"
        />
        <p className="micro muted">{tr('servers.addressHint')}</p>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Dialog>
  );
}
