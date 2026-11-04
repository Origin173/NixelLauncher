import { useEffect, useState } from 'react';
import type { Account, DeviceLogin, YggdrasilLoginResult } from '../../../shared/contracts';
import { errorMessage as message } from '../../../shared/error-message';
import { tr } from '../../../shared/i18n';
import { useApp } from '../state';
import { Action, Choice, Dialog, Field, Notice, Segments } from '../ui';

export function AccountDialog({
  instanceId,
  accountId,
  joinServer,
}: {
  instanceId?: string;
  accountId?: string;
  joinServer?: string;
}) {
  const a = useApp();
  const account = a.accounts.find((entry) => entry.id === accountId);
  const [type, setType] = useState(accountId ? 'yggdrasil' : 'microsoft');
  const [name, setName] = useState('');
  const [server, setServer] = useState(account?.authServer || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [device, setDevice] = useState<DeviceLogin | null>(null);
  const [selection, setSelection] = useState<Extract<
    YggdrasilLoginResult,
    { status: 'select-profile' }
  > | null>(null);
  const [profileId, setProfileId] = useState('');
  const visible = a.overlay?.type === 'account';
  useEffect(() => {
    if (!selection || !visible || type !== 'yggdrasil') return;
    return () => {
      void a.command('accounts.yggdrasil.cancel', { id: selection.id });
    };
  }, [selection, visible, type, a.command]);
  useEffect(() => {
    if (!device || !visible || type !== 'microsoft') return;
    return () => {
      void a.command('accounts.microsoft.cancel', { id: device.id });
    };
  }, [device, visible, type, a.command]);
  useEffect(() => {
    if (!device || !visible || type !== 'microsoft') return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (Date.now() > device.expiresAt) {
        if (active) {
          setError(tr('overlays.theDeviceCodeHasExpiredRequestA'));
          setDevice(null);
        }
        return;
      }
      try {
        const result = await window.nixel.invoke<{
          status: 'pending' | 'complete';
          account?: Account;
        }>('accounts.microsoft.poll', { id: device.id });
        if (!active) return;
        if (result.status === 'complete') {
          a.setOverlay(
            instanceId
              ? { type: 'launch-account', instanceId, accountId: result.account?.id, joinServer }
              : null,
          );
          return;
        }
        timer = setTimeout(() => void poll(), device.interval * 1000);
      } catch (e) {
        if (active) {
          setError(message(e));
          setDevice(null);
        }
      }
    };
    timer = setTimeout(() => void poll(), device.interval * 1000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [device, visible, type, instanceId, joinServer, a.setOverlay]);
  const submit = async () => {
    setPending(true);
    setError('');
    try {
      if (type === 'microsoft') {
        const result = await window.nixel.invoke<DeviceLogin>('accounts.microsoft.start');
        setDevice(result);
        await window.nixel.openExternal(result.verificationUri);
      } else {
        let saved: Account;
        if (type === 'offline')
          saved = await window.nixel.invoke<Account>('accounts.addOffline', { name: name.trim() });
        else if (selection) {
          saved = await window.nixel.invoke<Account>('accounts.yggdrasil.selectProfile', {
            id: selection.id,
            profileId,
          });
        } else {
          const result = await window.nixel.invoke<YggdrasilLoginResult>(
            'accounts.yggdrasil.login',
            { server, username, password, accountId },
          );
          setPassword('');
          if (result.status === 'select-profile') {
            setSelection(result);
            setProfileId(result.profiles[0]?.id || '');
            return;
          }
          saved = result.account;
        }
        a.setOverlay(
          instanceId
            ? { type: 'launch-account', instanceId, accountId: saved.id, joinServer }
            : null,
        );
      }
    } catch (e) {
      setSelection(null);
      setError(message(e));
    } finally {
      setPending(false);
    }
  };
  const disabled =
    type === 'microsoft'
      ? false
      : type === 'offline'
        ? !/^[A-Za-z0-9_]{1,16}$/.test(name)
        : selection
          ? !profileId
          : !server || !username || !password;
  return (
    <Dialog
      open={a.overlay !== null}
      onClose={() => {
        if (!pending) a.setOverlay(null);
      }}
      title={
        selection
          ? tr('accountProfiles.select')
          : accountId
            ? tr('accountProfiles.switch')
            : tr('overlays.addAccount')
      }
      footer={
        <>
          <Action variant="secondary" isDisabled={pending} onPress={() => a.setOverlay(null)}>
            {tr('overlays.cancel')}
          </Action>
          <Action
            isPending={pending}
            isDisabled={disabled || Boolean(device)}
            icon={type === 'microsoft' ? 'arrow' : 'plus'}
            onPress={() => void submit()}
          >
            {selection
              ? tr('accountProfiles.confirm')
              : type === 'microsoft'
                ? tr('overlays.getDeviceCode')
                : accountId
                  ? tr('accountProfiles.signIn')
                  : tr('overlays.addAccount')}
          </Action>
        </>
      }
    >
      <div className="stack">
        {!accountId && !selection && (
          <Segments
            value={type}
            options={['microsoft', 'offline', 'yggdrasil']}
            onChange={(value) => {
              if (!pending) {
                setDevice(null);
                setType(value);
              }
            }}
            label={tr('overlays.accountType')}
          />
        )}
        {type === 'microsoft' &&
          (device ? (
            <div className="auth-preview">
              <div className="microsoft-logo">
                <i />
                <i />
                <i />
                <i />
              </div>
              <p>{tr('overlays.signInToMicrosoftInYourBrowser')}</p>
              <strong className="auth-code">{device.userCode}</strong>
              <div className="row">
                <Action
                  size="sm"
                  variant="secondary"
                  icon="copy"
                  onPress={() => void navigator.clipboard.writeText(device.userCode)}
                >
                  {tr('overlays.copyCode')}
                </Action>
                <Action
                  size="sm"
                  variant="secondary"
                  onPress={() => void window.nixel.openExternal(device.verificationUri)}
                >
                  {tr('overlays.openSignInPage')}
                </Action>
              </div>
              <p className="muted">{tr('overlays.waitingForAuthorization')}</p>
            </div>
          ) : (
            <Notice>{tr('overlays.signInTakesPlaceInYourBrowser')}</Notice>
          ))}
        {type === 'offline' && (
          <>
            <Field
              label={tr('overlays.profileName')}
              value={name}
              onChange={setName}
              placeholder="Player"
              description={tr('overlays.116LettersNumbersOrUnderscores')}
            />
            <Notice>{tr('overlays.offlineProfilesWorkWithLocalGamesAnd')}</Notice>
          </>
        )}
        {type === 'yggdrasil' && !selection && (
          <>
            {accountId && <Notice>{tr('accountProfiles.reauthenticate')}</Notice>}
            {accountId ? (
              <Notice>{server}</Notice>
            ) : (
              <Field
                label={tr('overlays.yggdrasilAuthenticationServer')}
                type="url"
                value={server}
                onChange={setServer}
                placeholder="https://example.com/api/yggdrasil"
              />
            )}
            <Field label={tr('overlays.usernameOrEmail')} value={username} onChange={setUsername} />
            <Field
              label={tr('overlays.password')}
              type="password"
              value={password}
              onChange={setPassword}
            />
          </>
        )}
        {selection && (
          <Choice
            label={tr('accountProfiles.select')}
            value={profileId}
            onChange={setProfileId}
            options={selection.profiles.map((profile) => ({ id: profile.id, name: profile.name }))}
          />
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Dialog>
  );
}
