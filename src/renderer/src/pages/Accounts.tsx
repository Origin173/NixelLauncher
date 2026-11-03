import { Card } from '@heroui/react';
import { useState } from 'react';
import { useApp } from '../state';
import { Action, Choice, Empty, Heading, IconButton, Search, Tag } from '../ui';
import { PlaceholderIcon, Workspace } from '../workspace';

export function AccountsPage() {
  const a = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('全部账号');
  const shown = a.accounts.filter(
    (p) =>
      (filter === '全部账号' || p.type === filter) &&
      p.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Workspace title="账号">
      <Heading title="账号">
        <Action size="sm" icon="plus" onPress={() => a.setOverlay({ type: 'account' })}>
          添加账号
        </Action>
      </Heading>
      <div className="content-toolbar">
        <Search value={query} onChange={setQuery} placeholder="搜索账号" />
        <Choice
          label="账号类型"
          value={filter}
          onChange={setFilter}
          options={['全部账号', 'Microsoft', '离线'].map((name) => ({ id: name, name }))}
        />
      </div>
      <div className="workspace-scroll">
        {shown.length ? (
          <Card className="account-list">
            {shown.map((p) => (
              <div className="account-row" key={p.id}>
                <PlaceholderIcon name={p.name} />
                <div className="account-info">
                  <div className="row">
                    <h2>{p.name}</h2>
                    {a.defaultAccount === p.id && <Tag>默认</Tag>}
                  </div>
                  <p>
                    {p.type} · {p.detail}
                  </p>
                </div>
                <div className="account-actions">
                  {p.type !== '离线' && (
                    <IconButton
                      icon="refresh"
                      label={`刷新账号 ${p.name}`}
                      onPress={() => void a.command('accounts.refresh', { id: p.id })}
                    />
                  )}
                  {a.defaultAccount !== p.id && (
                    <Action size="sm" variant="ghost" onPress={() => a.setDefaultAccount(p.id)}>
                      设为默认
                    </Action>
                  )}
                  <IconButton
                    icon="trash"
                    label={`移除账号 ${p.name}`}
                    onPress={() =>
                      a.setOverlay({
                        type: 'confirm',
                        title: `移除账号 ${p.name}？`,
                        detail: '从启动器移除保存的身份。游戏账号与存档不受影响。',
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
            title={a.accounts.length ? '没有匹配的账号' : '添加你的第一个账号'}
            detail="登录 Microsoft 账号，或创建一个离线角色。"
            icon="user"
          >
            <Action icon="plus" onPress={() => a.setOverlay({ type: 'account' })}>
              添加账号
            </Action>
          </Empty>
        )}
      </div>
    </Workspace>
  );
}
