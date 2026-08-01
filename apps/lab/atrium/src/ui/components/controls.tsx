import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/adapters/react';
import { cx } from '../lib/cx';
import { COLOR } from '../lib/tokens';
import { Icon } from './display';

// Controls. Every one dispatches `ui:click` with its ref and, where it carries
// one, a payload. No callbacks in props, ever — interaction is ref + trigger.

const ButtonProps = z
  .object({
    variant: z.string().optional().describe('solid quiet plain danger'),
    big: z.boolean().optional().describe('A full-width target — a phone in one hand, or gloves on.'),
    icon: z.string().optional(),
    disabled: z.boolean().optional(),
    label: z.string().optional().describe('Accessible name. REQUIRED when the button is icon-only — a glyph with no text has no name for a screen reader, a tooltip, or a test.'),
    value: z.unknown().optional().describe('Payload sent on click.'),
  })
  .strict();

type ButtonP = z.infer<typeof ButtonProps> & { novaRef?: string; children?: React.ReactNode };

export const Button: NovaComponent<z.infer<typeof ButtonProps>> = ({ variant = 'solid', big, icon, disabled, label, value, novaRef, children }: ButtonP) => {
  const dispatch = useNovaDispatch();
  return (
    <button
      type="button"
      disabled={disabled === true}
      {...(label === undefined ? {} : { 'aria-label': label, title: label })}
      className={cx('at-btn', `at-btn--${variant}`, big === true && 'at-btn--big')}
      onClick={() => {
        if (disabled !== true && novaRef !== undefined) dispatch({ type: 'ui:click', ref: novaRef, payload: value });
      }}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}
    >
      {icon !== undefined ? <Icon name={icon} size={big === true ? 20 : 16} color={variant === 'solid' || variant === 'ink' ? 'invert' : variant === 'danger' ? 'alert' : 'accent'} /> : null}
      {children}
    </button>
  );
};
Button.meta = { description: 'A button. `big` is the phone/gloves target used on the service surface.', propsSchema: ButtonProps };

const TabsProps = z.object({ value: z.string().optional(), options: z.array(z.object({ value: z.string(), label: z.string() })) }).strict();

type TabsP = z.infer<typeof TabsProps> & { novaRef?: string };

export const Tabs: NovaComponent<z.infer<typeof TabsProps>> = ({ value, options, novaRef }: TabsP) => {
  const dispatch = useNovaDispatch();
  return (
    <div className="at-tabs">
      {options.map((o) => (
        <button key={o.value} type="button" className={cx('at-tab', o.value === value && 'at-tab--on')} onClick={() => novaRef !== undefined && dispatch({ type: 'ui:click', ref: novaRef, payload: o.value })}>
          {o.label}
        </button>
      ))}
    </div>
  );
};
Tabs.meta = { description: 'A pill tab strip. Emits the chosen value as the click payload.', propsSchema: TabsProps };

const NavItemProps = z.object({ label: z.string(), icon: z.string().optional(), active: z.boolean().optional(), badge: z.string().optional(), value: z.unknown().optional() }).strict();

type NavItemP = z.infer<typeof NavItemProps> & { novaRef?: string };

export const NavItem: NovaComponent<z.infer<typeof NavItemProps>> = ({ label, icon, active, badge, value, novaRef }: NavItemP) => {
  const dispatch = useNovaDispatch();
  return (
    <button type="button" className={cx('at-nav', active === true && 'at-nav--on')} onClick={() => novaRef !== undefined && dispatch({ type: 'ui:click', ref: novaRef, payload: value ?? label })}>
      {icon !== undefined ? <Icon name={icon} size={17} color={active === true ? 'accent' : 'mute'} /> : null}
      <span style={{ flex: 1 }}>{label}</span>
      {badge !== undefined && badge !== '' && badge !== '0' ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{badge}</span> : null}
    </button>
  );
};
NavItem.meta = { description: 'A sidebar row.', propsSchema: NavItemProps };

const MenuItemProps = z.object({ label: z.string(), icon: z.string().optional(), danger: z.boolean().optional(), value: z.unknown().optional() }).strict();

type MenuItemP = z.infer<typeof MenuItemProps> & { novaRef?: string };

export const MenuItem: NovaComponent<z.infer<typeof MenuItemProps>> = ({ label, icon, danger, value, novaRef }: MenuItemP) => {
  const dispatch = useNovaDispatch();
  return (
    <button
      type="button"
      onClick={() => novaRef !== undefined && dispatch({ type: 'ui:click', ref: novaRef, payload: value })}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'transparent', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', color: danger === true ? COLOR['alert'] : COLOR['ink'] }}
    >
      {icon !== undefined ? <Icon name={icon} size={15} color={danger === true ? 'alert' : 'mute'} /> : null}
      {label}
    </button>
  );
};
MenuItem.meta = { description: 'A row inside a menu.', propsSchema: MenuItemProps };
