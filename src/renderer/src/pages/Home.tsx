import { Button, Card, Description, Label, ListBox, Popover } from '@heroui/react';
import { useState } from 'react';
import { Icon } from '../icons';
import { LaunchButton } from '../LaunchButton';
import { useApp } from '../state';
import { Action, IconButton } from '../ui';
import { PlaceholderIcon } from '../workspace';

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
      : a.accounts.map((p) => ({ id: p.id, name: p.name, description: p.type }));
  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        isIconOnly={kind === 'instance'}
        className={kind === 'instance' ? 'instance-switch' : 'quick-account'}
        aria-label={kind === 'instance' ? '切换启动实例' : '切换启动账号'}
      >
        {kind === 'account' && (
          <>
            <PlaceholderIcon name={account?.name ?? '?'} size="sm" />
            <span className="picker-copy">
              <strong>{account?.name ?? '选择账号'}</strong>
              <small>{account?.type ?? '添加一个游戏账号'}</small>
            </span>
          </>
        )}
        <Icon name="down" size={14} />
      </Button>
      <Popover.Content placement="top end" className="quick-picker-popover">
        <Popover.Dialog aria-label={kind === 'instance' ? '选择启动实例' : '选择启动账号'}>
          <Popover.Heading>{kind === 'instance' ? '启动实例' : '启动账号'}</Popover.Heading>
          <ListBox
            aria-label={kind === 'instance' ? '可启动实例' : '可用账号'}
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
                <PlaceholderIcon name={item.name} size="sm" />
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
              添加{kind === 'instance' ? '实例' : '账号'}
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
              管理
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
      <section className="home-scene" aria-label="启动器主页">
        <div className="background-action">
          <Action
            isIconOnly
            variant="secondary"
            aria-label="更换背景"
            icon="image"
            onPress={() => a.setOverlay({ type: 'background' })}
          />
        </div>
        <Card
          className={`launch-dock ${instance ? '' : 'launch-dock--empty'}`}
          aria-label="游戏启动区域"
        >
          {!instance ? (
            <>
              <h2 className="dock-empty-title">添加游戏实例</h2>
              <div className="dock-empty-actions">
                <Action icon="plus" onPress={() => a.setOverlay({ type: 'create' })}>
                  创建实例
                </Action>
                <Action
                  icon="upload"
                  variant="secondary"
                  onPress={() => a.setOverlay({ type: 'import' })}
                >
                  导入实例
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
                  添加账号
                </Action>
              )}
              <div className="dock-divider" />
              <div className="dock-instance">
                <button
                  type="button"
                  className="dock-instance-detail"
                  aria-label={`管理实例 ${instance.name}`}
                  onClick={() => a.openInstance(instance.id)}
                >
                  <PlaceholderIcon name={instance.name} />
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
                  label="当前实例设置"
                  icon="settings"
                  onPress={() => a.openInstance(instance.id, '设置')}
                />
              </div>
            </>
          )}
        </Card>
      </section>
    </div>
  );
}
