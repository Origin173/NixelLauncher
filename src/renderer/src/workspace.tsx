import { Avatar, Label, ListBox } from '@heroui/react';
import type { ReactNode } from 'react';
import { tr } from '../../shared/i18n';
import { assetFor, launcherIcon, playerSkin } from './assets';
import { Icon, type IconName } from './icons';

export function Workspace({
  title,
  sidebar,
  footer,
  children,
}: {
  title: string;
  sidebar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`workspace-layout ${sidebar ? '' : 'workspace-layout--wide'}`}>
      {sidebar && (
        <aside className="workspace-sidebar" aria-label={title}>
          <h1 className="sidebar-heading">{title}</h1>
          <div className="sidebar-content">{sidebar}</div>
          {footer && <div className="sidebar-footer">{footer}</div>}
        </aside>
      )}
      <section className="workspace-content">{children}</section>
    </div>
  );
}

export function NavList({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: { id: string; name: string; icon: IconName; detail?: ReactNode }[];
}) {
  return (
    <ListBox
      aria-label={label}
      className="workspace-nav"
      selectionMode="single"
      selectionBehavior="replace"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        if (keys !== 'all' && keys.size) onChange(String([...keys][0]));
      }}
      renderEmptyState={() => (
        <p className="sidebar-no-results">{tr('workspace.noMatchingItems')}</p>
      )}
    >
      {items.map((item) => (
        <ListBox.Item
          key={item.id}
          id={item.id}
          textValue={item.name}
          className="workspace-nav-item"
        >
          <Icon name={item.icon} size={16} />
          <Label>{item.name}</Label>
          {item.detail}
        </ListBox.Item>
      ))}
    </ListBox>
  );
}

export function AssetIcon({
  src,
  kind,
  builtin = false,
  size = 'md',
}: {
  src?: string;
  kind?: string;
  builtin?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  if (kind === 'account')
    return (
      <span
        className={`skin-avatar skin-avatar--${size}`}
        style={{ backgroundImage: `url(${playerSkin})` }}
        aria-hidden="true"
      />
    );
  const image = builtin ? launcherIcon : src || assetFor(kind);
  return (
    <Avatar size={size} className="placeholder-icon" aria-hidden="true">
      {image && <Avatar.Image src={image} alt="" referrerPolicy="no-referrer" />}
      <Avatar.Fallback>
        <Icon name={kind === 'plugin' ? 'plugin' : 'box'} />
      </Avatar.Fallback>
    </Avatar>
  );
}
