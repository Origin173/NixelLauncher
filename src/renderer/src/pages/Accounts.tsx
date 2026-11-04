import { Card } from '@heroui/react';
import { useState } from 'react';
import { label, tr } from '../../../shared/i18n';
import { SkinDialog } from '../skins/SkinDialog';
import { useApp } from '../state';
import { Action, Choice, Empty, Heading, IconButton, Search, Tag } from '../ui';
import { AssetIcon, Workspace } from '../workspace';

export function AccountsPage() {
  const a = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all-accounts');
  const [appearanceAccount, setAppearanceAccount] = useState('');
  const selectedAppearance = a.accounts.find((entry) => entry.id === appearanceAccount);
  const shown = a.accounts.filter(
    (p) =>
      (filter === 'all-accounts' || p.type === filter) &&
      p.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Workspace title={tr('App.accounts')}>
      <Heading title={tr('App.accounts')}>
        <Action size="sm" icon="plus" onPress={() => a.setOverlay({ type: 'account' })}>
          {tr('overlays.addAccount')}
        </Action>
      </Heading>
      <div className="content-toolbar">
        <Search value={query} onChange={setQuery} placeholder={tr('Accounts.searchAccounts')} />
        <Choice
          label={tr('overlays.accountType')}
          value={filter}
          onChange={setFilter}
          options={['all-accounts', 'microsoft', 'offline', 'yggdrasil'].map((name) => ({
            id: name,
            name: label(name),
          }))}
        />
      </div>
      <div className="workspace-scroll">
        {shown.length ? (
          <Card className="account-list">
            {shown.map((p) => (
              <div className="account-row" key={p.id}>
                <AssetIcon kind="account" />
                <div className="account-info">
                  <div className="row">
                    <h2>{p.name}</h2>
                    {a.defaultAccount === p.id && <Tag>{tr('Accounts.default')}</Tag>}
                  </div>
                  <p>
                    {label(p.type)} ·{' '}
                    {p.type === 'offline'
                      ? tr('accounts.offlineProfileNoOnlineAuthentication')
                      : p.detail}
                  </p>
                </div>
                <div className="account-actions">
                  {a.plugins.some(
                    (plugin) => plugin.id === 'nixel.skins' && plugin.status === 'active',
                  ) &&
                    a.providers.some(
                      (provider) =>
                        provider.kind === 'accounts' &&
                        provider.id === p.provider &&
                        provider.capabilities?.includes('appearance'),
                    ) && (
                      <Action
                        size="sm"
                        variant="ghost"
                        icon="palette"
                        onPress={() => setAppearanceAccount(p.id)}
                      >
                        {tr('skins.title')}
                      </Action>
                    )}
                  {p.type === 'yggdrasil' && (
                    <Action
                      size="sm"
                      variant="ghost"
                      onPress={() => a.setOverlay({ type: 'account', accountId: p.id })}
                    >
                      {tr('accountProfiles.switch')}
                    </Action>
                  )}
                  {p.type !== 'offline' && (
                    <IconButton
                      icon="refresh"
                      label={tr('Accounts.refreshAccountValue', { value1: p.name })}
                      onPress={() => void a.command('accounts.refresh', { id: p.id })}
                    />
                  )}
                  {a.defaultAccount !== p.id && (
                    <Action size="sm" variant="ghost" onPress={() => a.setDefaultAccount(p.id)}>
                      {tr('Accounts.setAsDefault')}
                    </Action>
                  )}
                  <IconButton
                    icon="trash"
                    label={tr('Accounts.removeAccountValue', { value1: p.name })}
                    onPress={() =>
                      a.setOverlay({
                        type: 'confirm',
                        title: tr('Accounts.removeAccountValue2', { value1: p.name }),
                        detail: tr('Accounts.removeTheSavedIdentityFromThisLauncher'),
                        action: () => window.nixel.invoke('accounts.remove', { id: p.id }),
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <Empty
            title={
              a.accounts.length
                ? tr('Accounts.noMatchingAccounts')
                : tr('Accounts.addYourFirstAccount')
            }
            detail={tr('Accounts.signInWithMicrosoftOrCreateAn')}
            icon="user"
          >
            <Action icon="plus" onPress={() => a.setOverlay({ type: 'account' })}>
              {tr('overlays.addAccount')}
            </Action>
          </Empty>
        )}
      </div>
      {selectedAppearance && (
        <SkinDialog
          key={selectedAppearance.id}
          account={selectedAppearance}
          onClose={() => setAppearanceAccount('')}
        />
      )}
    </Workspace>
  );
}
