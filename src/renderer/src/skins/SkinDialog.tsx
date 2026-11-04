import { useEffect, useState } from 'react';
import type { Account } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/error-message';
import { label, tr } from '../../../shared/i18n';
import type {
  AccountAppearance,
  AppearanceChange,
  SkinFile,
  SkinModel,
} from '../../../shared/skins';
import { useApp } from '../state';
import { Action, Choice, Dialog, Notice, Tag } from '../ui';
import { SkinPreview } from './SkinPreview';

export function SkinDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const a = useApp();
  const [profile, setProfile] = useState<AccountAppearance>();
  const [file, setFile] = useState<SkinFile>();
  const [model, setModel] = useState<SkinModel>('classic');
  const [cape, setCape] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [taskId, setTaskId] = useState('');
  const task = a.tasks.find((entry) => entry.id === taskId);
  const busy =
    submitting ||
    a.tasks.some(
      (entry) =>
        entry.kind === 'skin-update' &&
        entry.resourceId === account.id &&
        entry.status === 'running',
    );
  useEffect(() => {
    let active = true;
    const requestId = `${revision}-${crypto.randomUUID()}`;
    setLoading(true);
    void window.nixel
      .invoke<AccountAppearance>('skins.profile', { accountId: account.id, requestId })
      .then((profile) => {
        if (active) {
          setProfile(profile);
          setCape(profile.capes.find((entry) => entry.active)?.id ?? '');
        }
      })
      .catch((error) => {
        if (active) {
          setProfile(undefined);
          setError(errorMessage(error));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      void a.command('skins.cancel', { requestId });
    };
  }, [account.id, revision, a.command]);
  useEffect(() => {
    if (!task || task.status === 'running') return;
    setTaskId('');
    if (task.status === 'completed') {
      setSuccess(true);
      setFile(undefined);
    } else setError(task.error || label(task.status));
    setRevision((value) => value + 1);
  }, [task]);
  const choose = async () => {
    setError('');
    try {
      const paths = await window.nixel.selectFiles({
        title: tr('skins.choose'),
        filters: [{ name: 'PNG', extensions: ['png'] }],
      });
      if (!paths[0]) return;
      const result = await window.nixel.invoke<SkinFile>('skins.file', { path: paths[0] });
      setFile(result);
      setSuccess(false);
    } catch (error) {
      setError(errorMessage(error));
    }
  };
  const change = async (change: AppearanceChange) => {
    setSubmitting(true);
    setSuccess(false);
    setError('');
    try {
      const result = await window.nixel.invoke<{ taskId: string }>('skins.change', {
        accountId: account.id,
        change,
      });
      setTaskId(result.taskId);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };
  const selectedCape = profile?.capes.find((entry) => entry.id === cape);
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={tr('skins.title')}
      description={account.name}
      footer={
        <Action variant="secondary" onPress={onClose}>
          {tr('skins.close')}
        </Action>
      }
    >
      <div className="stack">
        <div className="row spread">
          <strong>
            {tr(
              file || cape !== (profile?.capes.find((entry) => entry.active)?.id ?? '')
                ? 'skins.preview'
                : 'skins.current',
            )}
          </strong>
          <Action
            size="sm"
            variant="ghost"
            icon="refresh"
            isDisabled={loading || busy}
            onPress={() => {
              setSuccess(false);
              setError('');
              setRevision((value) => value + 1);
            }}
          >
            {tr('skins.refresh')}
          </Action>
        </div>
        {loading && <p className="muted">{tr('skins.loading')}</p>}
        {error && <Notice tone="danger">{error}</Notice>}
        {success && <Notice>{tr('skins.applied')}</Notice>}
        {(file || profile) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: 24,
            }}
          >
            <div>
              {file || profile?.skin ? (
                <SkinPreview
                  skin={file?.dataUrl ?? profile?.skin?.url ?? ''}
                  model={file ? model : (profile?.skin?.model ?? 'classic')}
                  cape={selectedCape?.url}
                />
              ) : (
                <Notice>{tr('skins.profileUnavailable')}</Notice>
              )}
              {!file && profile?.skin?.isDefault && <Tag>{tr('skins.default')}</Tag>}
            </div>
            <div className="stack">
              <p className="micro muted">{tr('skins.fileHint')}</p>
              <Action
                variant="secondary"
                icon="upload"
                isDisabled={busy}
                onPress={() => void choose()}
              >
                {tr('skins.choose')}
              </Action>
              {file && (
                <>
                  <Choice
                    label={tr('skins.model')}
                    value={model}
                    onChange={(value) => setModel(value as SkinModel)}
                    isDisabled={busy}
                    options={(['classic', 'slim'] as const).map((id) => ({
                      id,
                      name: tr(id === 'classic' ? 'skins.classic' : 'skins.slim'),
                    }))}
                  />
                  <Action
                    isDisabled={busy}
                    onPress={() =>
                      void change({ kind: 'upload', path: file.path, model, sha256: file.sha256 })
                    }
                  >
                    {tr('skins.upload')}
                  </Action>
                  <Action variant="ghost" isDisabled={busy} onPress={() => setFile(undefined)}>
                    {tr('skins.discard')}
                  </Action>
                </>
              )}
              <Action
                variant="secondary"
                isDisabled={busy || !profile || profile.skin?.isDefault}
                onPress={() => void change({ kind: 'reset' })}
              >
                {tr('skins.reset')}
              </Action>
              {profile?.capes.length ? (
                <>
                  <Choice
                    label={tr('skins.cape')}
                    value={cape}
                    onChange={setCape}
                    isDisabled={busy}
                    options={[
                      { id: '', name: tr('skins.noCape') },
                      ...profile.capes.map((entry) => ({ id: entry.id, name: entry.name })),
                    ]}
                  />
                  <Action
                    variant="secondary"
                    isDisabled={
                      busy || cape === (profile.capes.find((entry) => entry.active)?.id ?? '')
                    }
                    onPress={() => void change({ kind: 'cape', capeId: cape || null })}
                  >
                    {tr('skins.applyCape')}
                  </Action>
                </>
              ) : (
                profile && <p className="micro muted">{tr('skins.noCapes')}</p>
              )}
              {task?.status === 'running' && <Notice>{task.detail}</Notice>}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
