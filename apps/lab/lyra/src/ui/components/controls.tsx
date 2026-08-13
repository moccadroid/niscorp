import { z } from 'zod';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { COLOR, SIZE, WEIGHT } from '../lib/tokens';
import { cx } from '../lib/cx';
import { Icon } from './display';

const ButtonProps = z
  .object({
    variant: z.enum(['solid', 'accent', 'ghost', 'outline', 'danger']).optional(),
    big: z.boolean().optional(),
    disabled: z.boolean().optional(),
    label: z.string().optional().describe('Accessible name; also the visible text when there are no children'),
    value: z.unknown().optional().describe('Carried as the click payload — how one ref serves every row of a list'),
    full: z.boolean().optional(),
    href: z.string().optional().describe('When set, this is a LINK styled as a button — it navigates rather than dispatching. For sending somebody OUT of the app (a payment page, a provider’s onboarding). Opens in a new tab.'),
  })
  .strict();

type ButtonP = z.infer<typeof ButtonProps> & { novaRef?: string; children?: React.ReactNode };

export const Button: NovaComponent<z.infer<typeof ButtonProps>> = ({ variant = 'solid', big, disabled, label, value, full, href, novaRef, children }: ButtonP) => {
  const dispatch = useNovaDispatch();
  const className = cx('ly-btn', `ly-btn--${variant}`, big === true && 'ly-btn--big');
  const style = full === true ? { width: '100%' } : undefined;

  // A LINK THAT LOOKS LIKE A BUTTON. Set `href` and this navigates instead of
  // dispatching — the only honest way to send somebody OUT of the app, to a
  // payment page or a provider's onboarding, where a dispatched click could
  // never take them. Silently ignoring `href` on a plain button (as this did)
  // renders a dead control on exactly the screen where "continue" matters most.
  //
  // New tab, and `noopener` — an external page must not get a handle back to the
  // window that opened it.
  if (href !== undefined && href !== '') {
    return (
      <a
        href={disabled === true ? undefined : href}
        target="_blank"
        rel="noopener noreferrer"
        {...(label === undefined ? {} : { 'aria-label': label })}
        className={cx(className, disabled === true && 'ly-btn--disabled')}
        style={style}
        role="button"
      >
        {children ?? label}
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled === true}
      {...(label === undefined ? {} : { 'aria-label': label })}
      className={className}
      style={style}
      onClick={() => {
        if (disabled !== true && novaRef !== undefined) dispatch({ type: 'ui:click', ref: novaRef, payload: value });
      }}
    >
      {children ?? label}
    </button>
  );
};
Button.meta = { description: 'A button. `solid` is ink; `accent` is the neon and should appear about once a screen. With `href` it is a link styled as a button — for sending somebody out of the app.', propsSchema: ButtonProps };

const TabsProps = z
  .object({
    value: z.string().optional(),
    look: z.enum(['segment', 'underline']).optional(),
    options: z.array(z.object({ value: z.string(), label: z.string() }).passthrough()),
  })
  .strict();
type TabsP = Partial<z.infer<typeof TabsProps>> & { novaRef?: string };

export const Tabs: NovaComponent<Partial<z.infer<typeof TabsProps>>> = ({ value, look = 'segment', options, novaRef }: TabsP) => {
  const dispatch = useNovaDispatch();
  const line = look === 'underline';
  return (
    <div
      className={cx('ly-segments', line && 'ly-subnav')}
      style={
        line
          ? { display: 'flex', maxWidth: '100%', overflowX: 'auto' }
          : { display: 'inline-flex', gap: 2, padding: 3, background: 'var(--surface-sunk)', borderRadius: 'var(--radius-md)', maxWidth: '100%', overflowX: 'auto' }
      }
    >
      {(options ?? []).map((o) => (
        <button
          key={o.value}
          type="button"
          className={cx('ly-btn', line && 'ly-subnav__tab', line && o.value === value && 'ly-subnav__tab--on')}
          aria-current={line && o.value === value ? 'page' : undefined}
          style={
            line
              ? undefined
              : {
                  padding: '5px 12px',
                  fontSize: SIZE['sm'],
                  fontWeight: WEIGHT['medium'],
                  flex: '0 0 auto',
                  whiteSpace: 'nowrap',
                  background: o.value === value ? 'var(--surface)' : 'transparent',
                  color: o.value === value ? COLOR['ink'] : COLOR['mute'],
                  boxShadow: o.value === value ? 'var(--shadow-sm)' : 'none',
                }
          }
          onClick={() => novaRef !== undefined && dispatch({ type: 'ui:click', ref: novaRef, payload: o })}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};
Tabs.meta = { description: 'A segmented control. The payload is the chosen value.', propsSchema: TabsProps };

const NavItemProps = z.object({ label: z.string(), active: z.boolean().optional(), count: z.number().optional(), value: z.unknown().optional() }).strict();
type NavItemP = Partial<z.infer<typeof NavItemProps>> & { novaRef?: string };

export const NavItem: NovaComponent<Partial<z.infer<typeof NavItemProps>>> = ({ label, active, count, value, novaRef }: NavItemP) => {
  const dispatch = useNovaDispatch();
  return (
    <button
      type="button"
      className="ly-btn ly-btn--ghost"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        justifyContent: 'space-between',
        padding: '7px 10px',
        fontWeight: active === true ? WEIGHT['semi'] : WEIGHT['medium'],
        color: active === true ? COLOR['ink'] : COLOR['mute'],
        background: active === true ? 'var(--surface-sunk)' : 'transparent',
      }}
      onClick={() => novaRef !== undefined && dispatch({ type: 'ui:click', ref: novaRef, payload: value ?? label })}
    >
      <span>{label}</span>
      {count === undefined ? null : <span style={{ fontSize: SIZE['xs'], color: COLOR['faint'], fontVariantNumeric: 'tabular-nums' }}>{count}</span>}
    </button>
  );
};
NavItem.meta = { description: 'One entry in a navigation list. Active is a served fact, never a role check.', propsSchema: NavItemProps };

const TabProps = z.object({ label: z.string(), value: z.string(), current: z.string().optional(), icon: z.string().optional(), payload: z.unknown().optional() }).strict();
type TabP = Partial<z.infer<typeof TabProps>> & { novaRef?: string };

export const Tab: NovaComponent<Partial<z.infer<typeof TabProps>>> = ({ label, value, current, icon, payload, novaRef }: TabP) => {
  const active = value !== undefined && value !== '' && value === current;
  const dispatch = useNovaDispatch();
  return (
    <button
      type="button"
      className={cx('ly-tab', active && 'ly-tab--on')}
      aria-current={active ? 'page' : undefined}
      onClick={() => novaRef !== undefined && dispatch({ type: 'ui:click', ref: novaRef, payload: payload ?? value ?? label })}
    >
      {/* THE GLYPH IS THE TARGET, the word underneath is the confirmation.
          A thumb bar of five words is five reading tasks; a thumb bar of five
          icons is one glance, and the label is what makes an unfamiliar icon
          learnable rather than a guess. The dot marks where you are for the
          case an icon set cannot carry on its own. */}
      {icon === undefined || icon === '' ? <span className="ly-tab__dot" /> : <Icon name={icon} size={20} />}
      <span>{label}</span>
    </button>
  );
};
Tab.meta = { description: 'One destination in the tab bar. Five at most — a sixth is a sign the grouping is wrong.', propsSchema: TabProps };

const RolePickerProps = z
  .object({
    value: z.string().optional(),
    options: z.array(z.object({ value: z.string(), label: z.string() })),
    context: z.unknown().optional(),
  })
  .strict();
type RolePickerP = Partial<z.infer<typeof RolePickerProps>> & { novaRef?: string };

export const RolePicker: NovaComponent<Partial<z.infer<typeof RolePickerProps>>> = ({ value, options, context, novaRef }: RolePickerP) => {
  const dispatch = useNovaDispatch();
  return (
    <select
      className="ly-field ly-field--compact"
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => {
        if (novaRef === undefined) return;
        const ctx = context !== null && typeof context === 'object' ? context : {};
        dispatch({ type: 'ui:click', ref: novaRef, payload: { ...(ctx as Record<string, unknown>), role: e.target.value } });
      }}
    >
      {(options ?? []).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
};
RolePicker.meta = { description: 'Pick somebody’s role. Carries its row back with the choice, so one trigger serves a whole list.', propsSchema: RolePickerProps };

const DayToggleProps = z.object({ label: z.string(), value: z.boolean().optional() }).strict();
type DayToggleP = Partial<z.infer<typeof DayToggleProps>> & { novaRef?: string; novaModel?: { ref?: string } };

export const DayToggle: NovaComponent<Partial<z.infer<typeof DayToggleProps>>> = ({ label, value, novaRef, novaModel }: DayToggleP) => {
  const dispatch = useNovaDispatch();
  const on = value === true;
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cx('ly-day', on && 'ly-day--on')}
      onClick={() => {
        const ref = novaModel?.ref ?? novaRef;
        if (ref !== undefined) dispatch({ type: 'ui:click', ref, payload: { next: !on } });
      }}
    >
      {label}
    </button>
  );
};
DayToggle.meta = { description: 'One day of the week, on or off. A row of them is a week.', propsSchema: DayToggleProps };
