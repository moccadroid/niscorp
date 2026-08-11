import { z } from 'zod';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { COLOR, SIZE, WEIGHT } from '../lib/tokens';
import { cx } from '../lib/cx';
import { Icon } from './display';

// Everything that emits. A control never receives a callback — it dispatches
// `ui:click` with its own `novaRef`, and the action's triggers decide what that
// means. `value` becomes the event payload, which is how one ref inside a loop
// serves a whole list.

const ButtonProps = z
  .object({
    variant: z.enum(['solid', 'accent', 'ghost', 'outline', 'danger']).optional(),
    big: z.boolean().optional(),
    disabled: z.boolean().optional(),
    label: z.string().optional().describe('Accessible name; also the visible text when there are no children'),
    value: z.unknown().optional().describe('Carried as the click payload — how one ref serves every row of a list'),
    full: z.boolean().optional(),
  })
  .strict();

type ButtonP = z.infer<typeof ButtonProps> & { novaRef?: string; children?: React.ReactNode };

export const Button: NovaComponent<z.infer<typeof ButtonProps>> = ({ variant = 'solid', big, disabled, label, value, full, novaRef, children }: ButtonP) => {
  const dispatch = useNovaDispatch();
  return (
    <button
      type="button"
      disabled={disabled === true}
      {...(label === undefined ? {} : { 'aria-label': label })}
      className={cx('ly-btn', `ly-btn--${variant}`, big === true && 'ly-btn--big')}
      style={full === true ? { width: '100%' } : undefined}
      onClick={() => {
        if (disabled !== true && novaRef !== undefined) dispatch({ type: 'ui:click', ref: novaRef, payload: value });
      }}
    >
      {children ?? label}
    </button>
  );
};
Button.meta = { description: 'A button. `solid` is ink; `accent` is the neon and should appear about once a screen.', propsSchema: ButtonProps };

// TWO LOOKS, BECAUSE THEY ARE TWO THINGS.
//
//   `segment` — a FILTER. Which slice of the same screen you are looking at:
//   Current or Everyone, Calendar or List. It is a control, it sits in the
//   content, and it looks like a control: pills in a sunk tray.
//
//   `underline` — NAVIGATION. Which screen of this area you are on. It is not
//   a control and must not look like one, which is exactly what went wrong
//   when the area row shipped as a pill tray: it read as a filter on the
//   screen below it rather than as the way to the two screens beside it.
//
// Both emit the same event, so the difference is entirely what a person is
// being told they are about to change.
const TabsProps = z
  .object({
    value: z.string().optional(),
    look: z.enum(['segment', 'underline']).optional(),
    // `.passthrough()` — AN OPTION CARRIES ITS OWN PARAMETER.
    //
    // A tab dispatches its whole option, not just the chosen string, which is
    // what makes one ref serve a filter whose slices take different arguments:
    // `{ value: 'everyone', label: 'Everyone', statuses: [...] }` sets the
    // parameter from the option itself. Without it, "Current" and "Everyone"
    // had to be two buttons with two triggers, because the trigger grammar has
    // no conditional and there was nowhere else for the difference to live.
    //
    // Same trick as `Rows` (one ref, every row) and `RolePicker` (the choice
    // arrives with its subject). The grammar's answer to branching is always
    // to put the difference in the payload.
    options: z.array(z.object({ value: z.string(), label: z.string() }).passthrough()),
  })
  .strict();
type TabsP = Partial<z.infer<typeof TabsProps>> & { novaRef?: string };

// IT SCROLLS RATHER THAN WRAPS. Four segments of two words apiece overflow a
// 375px screen, and a segmented control that has wrapped onto two lines has
// stopped being one control. Sideways is the behaviour every native tab strip
// has; the buttons refuse to shrink so the words never break.
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

// A destination in the tab bar.
//
// Separate from `NavItem` because it is a different thing: a nav item is a link
// in a list, a tab is one of five places the application can be. The dot is the
// only ornament, and it is what tells a thumb where it already is.
// `current` rather than `active`: the comparison happens HERE, because a layout
// cannot compare two values and a tab bar whose highlight lagged a tap by a
// round trip would feel broken on a phone. Same trick `Tabs` uses.
//
// WHAT IT IS AND WHERE IT GOES ARE TWO VALUES. A tab lights when its `value`
// matches `current` — and an AREA's identity is not the screen it opens: People
// lights as `hub.people` and navigates to `people.list`. Collapsing them meant
// either the highlight never matched or the tap opened a hub screen that no
// longer exists. `payload` carries the destination; `value` carries the
// identity; when a tab is its own destination they are simply the same string.
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


// A ROLE PICKER — one control per person, not four buttons.
//
// Four buttons was a bad call and the screenshot showed why: they overflowed
// their row, wrapped, and turned a list of people into a wall of forty words.
// The argument for them was "a permission change buried in a select is one
// nobody reviews" — which stopped being true the moment the change grew a
// confirmation step. With a confirm, a select is simply the better control:
// one per row, showing the CURRENT role, and no wrapping at any width.
//
// It is not the generic `Select`, and the reason is identity: `Select` emits a
// value and nothing else, so a list of them cannot say WHICH person changed.
// This one carries its row's context back with the choice, which is what lets
// one trigger serve every row.
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


// A DAY, ON OR OFF — the control every calendar in the world uses.
//
// This started as `Switch`, which was wrong twice. A switch is for one thing
// being on or off ("email me"), not for picking several out of a set; and
// Lyra's Switch keeps its label in `aria-label` only, so seven of them in a row
// rendered as seven anonymous toggles. Nothing on screen said which one was
// Monday.
//
// A day picker is a row of labelled pills, filled when chosen. It fits on a
// phone, it says what it is, and the whole week reads at a glance.
//
// It keeps `Switch`'s dispatch contract — `ui:click` carrying `{ next }` — so
// the triggers that already set each day did not have to change.
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
