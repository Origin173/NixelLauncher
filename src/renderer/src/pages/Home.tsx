import { Button, Card, Description, Label, ListBox, Popover } from '@heroui/react';
import { useState } from 'react';
import { label, tr } from '../../../shared/i18n';
import { Icon } from '../icons';
import { LaunchButton } from '../LaunchButton';
import { useApp } from '../state';
import { Action, IconButton } from '../ui';
import { AssetIcon } from '../workspace';

function QuickPicker({ kind }: { kind: 'instance' | 'account' }) {
  const a = useApp();
  const [open, setOpen] = useState(false);
  const instance = a.launchInstance;
  const accountId = a.launchAccountId || instance?.account || a.defaultAccount;
  const account = a.accounts.find((p) => p.id === accountId);
  function choose(id: string) {
    if (kind === 'instance') {
      a.setLaunchId(id);
      a.setLaunchAccountId('');
    } else a.setLaunchAccountId(id);
    setOpen(false);
  }
  const items =
    kind === 'instance'
      ? a.instances.map((i) => ({
          id: i.id,
          name: i.name,
          description: `${i.version} · ${i.loader}`,
        }))
      : a.accounts.map((p) => ({ id: p.id, name: p.name, description: label(p.type) }));
  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        isIconOnly={kind === 'instance'}
        className={kind === 'instance' ? 'instance-switch' : 'quick-account'}
        aria-label={
          kind === 'instance' ? tr('Home.switchLaunchInstance') : tr('Home.switchLaunchAccount')
        }
      >
        {kind === 'account' && (
          <>
            <AssetIcon kind="account" size="sm" />
            <span className="picker-copy">
              <strong>{account?.name ?? tr('Home.chooseAccount')}</strong>
              <small>{account ? label(account.type) : tr('Home.addAGameAccount')}</small>
            </span>
          </>
        )}
        <Icon name="down" size={14} />
      </Button>
      <Popover.Content placement="top end" className="quick-picker-popover">
        <Popover.Dialog
          aria-label={
            kind === 'instance' ? tr('Home.chooseLaunchInstance') : tr('Home.chooseLaunchAccount')
          }
        >
          <Popover.Heading>
            {kind === 'instance' ? tr('Home.launchInstance') : tr('Home.launchAccount')}
          </Popover.Heading>
          <ListBox
            aria-label={
              kind === 'instance' ? tr('Home.availableInstances') : tr('Home.availableAccounts')
            }
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[kind === 'instance' ? (instance?.id ?? '') : accountId]}
            onSelectionChange={(keys) => {
              if (keys !== 'all' && keys.size) choose(String([...keys][0]));
            }}
            onAction={(key) => choose(String(key))}
          >
            {items.map((item) => (
              <ListBox.Item key={item.id} id={item.id} textValue={item.name}>
                <AssetIcon
                  kind={
                    kind === 'account'
                      ? 'account'
                      : a.instances.find((instance) => instance.id === item.id)?.loader
                  }
                  size="sm"
                />
                <div className="picker-copy">
                  <Label>{item.name}</Label>
                  <Description>{item.description}</Description>
                </div>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
          <div className="quick-picker-footer">
            <Action
              variant="ghost"
              size="sm"
              icon="plus"
              onPress={() => {
                setOpen(false);
                a.setOverlay({ type: kind === 'instance' ? 'create' : 'account' });
              }}
            >
              {kind === 'instance' ? tr('home.addInstance') : tr('overlays.addAccount')}
            </Action>
            <Action
              variant="ghost"
              size="sm"
              onPress={() => {
                setOpen(false);
                if (kind === 'instance' && instance) a.openInstance(instance.id);
                else a.setPage('accounts');
              }}
            >
              {tr('Home.manage')}
              <Icon name="arrow" size={14} />
            </Action>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

export function Home() {
  const a = useApp();
  const instance = a.launchInstance;
  return (
    <div className="home-page">
      <section className="home-scene" aria-label={tr('Home.launcherHome')}>
        <div className="background-action">
          <Action
            isIconOnly
            variant="secondary"
            aria-label={tr('overlays.changeBackground')}
            icon="image"
            onPress={() => a.setOverlay({ type: 'background' })}
          />
        </div>
        <Card
          className={`launch-dock ${instance ? '' : 'launch-dock--empty'}`}
          aria-label={tr('Home.gameLaunchArea')}
        >
          {!instance ? (
            <>
              <h2 className="dock-empty-title">{tr('Home.addAGameInstance')}</h2>
              <div className="dock-empty-actions">
                <Action icon="plus" onPress={() => a.setOverlay({ type: 'create' })}>
                  {tr('overlays.createInstance')}
                </Action>
                <Action
                  icon="upload"
                  variant="secondary"
                  onPress={() => a.setOverlay({ type: 'import' })}
                >
                  {tr('overlays.importInstance')}
                </Action>
              </div>
            </>
          ) : (
            <>
              {a.accounts.length ? (
                <QuickPicker kind="account" />
              ) : (
                <Action
                  variant="ghost"
                  icon="user"
                  onPress={() => a.setOverlay({ type: 'account' })}
                >
                  {tr('overlays.addAccount')}
                </Action>
              )}
              <div className="dock-divider" />
              <div className="dock-instance">
                <button
                  type="button"
                  className="dock-instance-detail"
                  aria-label={tr('Home.manageInstanceValue', { value1: instance.name })}
                  onClick={() => a.openInstance(instance.id)}
                >
                  <AssetIcon kind={instance.loader} />
                  <span className="picker-copy">
                    <strong>{instance.name}</strong>
                    <small>
                      {instance.version} · {instance.loader}
                    </small>
                  </span>
                </button>
                <QuickPicker kind="instance" />
              </div>
              <div className="dock-actions">
                <LaunchButton
                  instanceId={instance.id}
                  accountId={a.launchAccountId || instance.account || a.defaultAccount}
                  fullWidth
                  className="launch-main-action"
                />
                <IconButton
                  label={tr('Home.currentInstanceSettings')}
                  icon="settings"
                  onPress={() => a.openInstance(instance.id, 'settings')}
                />
              </div>
            </>
          )}
        </Card>
      </section>
    </div>
  );
}
