import {
  Alert,
  Avatar,
  Button,
  Checkbox,
  Chip,
  Input,
  Label,
  ListBox,
  Modal,
  SearchField,
  Select,
  Slider,
  Switch,
  Tabs,
  TextArea,
  TextField,
  Tooltip,
} from '@heroui/react';
import type { ComponentProps, ReactNode } from 'react';
import { label as displayLabel, tr } from '../../shared/i18n';
import type { IconName } from './icons';
import { Icon } from './icons';

export function Action({
  children,
  icon,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children'> & { icon?: IconName; children?: ReactNode }) {
  return (
    <Button {...props}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </Button>
  );
}
export function IconButton({
  icon,
  label,
  onPress,
  className = '',
  isDisabled = false,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  className?: string;
  isDisabled?: boolean;
}) {
  return (
    <Tooltip>
      <Button
        isDisabled={isDisabled}
        className={className}
        isIconOnly
        variant="ghost"
        aria-label={label}
        onPress={onPress}
      >
        <Icon name={icon} />
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}
export function Tag({
  children,
  color = 'default',
}: {
  children: ReactNode;
  color?: 'default' | 'success' | 'warning' | 'danger' | 'accent';
}) {
  return (
    <Chip size="sm" variant="soft" color={color}>
      {children}
    </Chip>
  );
}
export function Tile({
  color = 'green',
  icon = 'box',
  size = 'md',
}: {
  color?: string;
  icon?: IconName;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <Avatar
      className="tile"
      size={size}
      variant="soft"
      color={color === 'blue' ? 'accent' : 'default'}
    >
      <Avatar.Fallback>
        <Icon name={icon} size={size === 'lg' ? 24 : 18} />
      </Avatar.Fallback>
    </Avatar>
  );
}
export function PlayerAvatar({
  color = 'green',
  large = false,
}: {
  color?: string;
  large?: boolean;
}) {
  return (
    <Avatar size={large ? 'lg' : 'md'} color={color === 'green' ? 'accent' : 'default'}>
      <Avatar.Fallback>
        <Icon name="user" size={large ? 24 : 20} />
      </Avatar.Fallback>
    </Avatar>
  );
}
export function Heading({
  title,
  sub,
  children,
  leading,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div className="heading-title">
        {leading}
        <div>
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
      </div>
      <div className="row">{children}</div>
    </div>
  );
}
export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  description,
  error,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'number' | 'url' | 'password';
  description?: string;
  error?: string;
  hideLabel?: boolean;
}) {
  return (
    <TextField className="field" value={value} onChange={onChange} isInvalid={Boolean(error)}>
      <Label className={hideLabel ? 'sr-only' : undefined}>{label}</Label>
      <Input placeholder={placeholder} type={type} />
      {description && <span className="field-hint">{description}</span>}
      {error && <span className="field-error">{error}</span>}
    </TextField>
  );
}
export function ArgumentField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField className="field" value={value} onChange={onChange}>
      <Label>{label}</Label>
      <TextArea rows={3} placeholder={tr('ui.oneArgumentPerLine')} />
      <span className="field-hint">{tr('ui.oneArgumentPerLineValuesContainingSpaces')}</span>
    </TextField>
  );
}
export function Search({
  value,
  onChange,
  placeholder = tr('ui.search'),
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <SearchField className="search-box" aria-label={placeholder} value={value} onChange={onChange}>
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={placeholder} />
        <SearchField.ClearButton aria-label={tr('ui.clearSearch')} />
      </SearchField.Group>
    </SearchField>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange,
  className = '',
  leading,
  description,
  isDisabled = false,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (v: string) => void;
  className?: string;
  leading?: ReactNode;
  description?: string;
  isDisabled?: boolean;
}) {
  return (
    <Select
      isDisabled={isDisabled}
      className={`choice ${className}`}
      aria-label={label}
      value={value || '__inherit__'}
      onChange={(v) => onChange(v === '__inherit__' ? '' : String(v ?? ''))}
    >
      <Select.Trigger className={leading || description ? 'choice-rich-trigger' : undefined}>
        {leading}
        {description ? (
          <span className="choice-copy">
            <Select.Value />
            <span className="choice-description">{description}</span>
          </span>
        ) : (
          <Select.Value />
        )}
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox aria-label={label}>
          {options.map((o) => (
            <ListBox.Item
              key={o.id || '__inherit__'}
              id={o.id || '__inherit__'}
              textValue={o.id === o.name ? displayLabel(o.name) : o.name}
            >
              <Label>{o.id === o.name ? displayLabel(o.name) : o.name}</Label>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
export function Toggle({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Switch isSelected={value} onChange={onChange} isDisabled={disabled} size="sm">
      <Switch.Content aria-label={label}>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Label className="sr-only">{label}</Label>
      </Switch.Content>
    </Switch>
  );
}
export function Check({
  label,
  value,
  onChange,
  isDisabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  isDisabled?: boolean;
}) {
  return (
    <Checkbox isSelected={value} onChange={onChange} isDisabled={isDisabled}>
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Label>{label}</Label>
      </Checkbox.Content>
    </Checkbox>
  );
}
export function Segments({
  value,
  options,
  onChange,
  label = tr('ui.pageCategory'),
  secondary = false,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  label?: string;
  secondary?: boolean;
}) {
  return (
    <Tabs
      className="segments"
      selectedKey={value}
      onSelectionChange={(k) => onChange(String(k))}
      variant={secondary ? 'secondary' : 'primary'}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label={label}>
          {options.map((o) => (
            <Tabs.Tab key={o} id={o} className="whitespace-nowrap">
              {displayLabel(o)}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );
}
export function Range({
  label,
  value,
  onChange,
  max = 100,
  min = 0,
  suffix = '%',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
  min?: number;
  suffix?: string;
}) {
  return (
    <Slider
      aria-label={label}
      minValue={min}
      maxValue={max}
      value={value}
      onChange={(v) => onChange(Number(v))}
    >
      <div className="row spread">
        <Label>{label}</Label>
        <Slider.Output>
          {value}
          {suffix}
        </Slider.Output>
      </div>
      <Slider.Track>
        <Slider.Fill />
        <Slider.Thumb />
      </Slider.Track>
    </Slider>
  );
}
export function SettingRow({
  title,
  description,
  children,
  last = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`setting-row ${last ? 'last' : ''}`}>
      <div>
        <strong>{title}</strong>
        {description && <p>{description}</p>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}
export function Group({
  title,
  children,
  description,
}: {
  title: string;
  children: ReactNode;
  description?: string;
}) {
  return (
    <section className="setting-group">
      <div className="group-heading">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <div className="setting-card">{children}</div>
    </section>
  );
}
export function Empty({
  title,
  detail,
  icon = 'box',
  children,
}: {
  title: string;
  detail?: string;
  icon?: IconName;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={32} />
      </span>
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      <div className="row">{children}</div>
    </div>
  );
}
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warning' | 'danger' | 'success';
}) {
  return (
    <Alert status={tone === 'info' ? 'default' : tone}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{children}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Modal.Container size={wide ? 'lg' : 'md'}>
        <Modal.Dialog>
          <Modal.CloseTrigger aria-label={tr('ui.closeDialog')} />
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
            {description && <p className="muted">{description}</p>}
          </Modal.Header>
          <Modal.Body>{children}</Modal.Body>
          {footer && <Modal.Footer>{footer}</Modal.Footer>}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
