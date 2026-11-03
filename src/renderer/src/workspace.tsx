import { Avatar, Label, ListBox } from '@heroui/react';
import type { ReactNode } from 'react';
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
      renderEmptyState={() => <p className="sidebar-no-results">没有匹配的项目</p>}
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

export function PlaceholderIcon({
  name,
  size = 'md',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const initials = /^[a-z]/i.test(name)
    ? name
        .split(/\s+/)
        .filter((part) => /^[a-z]/i.test(part))
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : name.slice(0, 1);
  return (
    <Avatar size={size} className="placeholder-icon" aria-hidden="true">
      <Avatar.Fallback>{initials}</Avatar.Fallback>
    </Avatar>
  );
}
