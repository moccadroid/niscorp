import { type ReactNode } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/react';
import { cx } from '../lib/cx';
import { Icon } from './display';

// Interactive primitives — Button, NavItem. Each fires `ui:click` carrying the
// node's ref (injected as novaRef) for a trigger to match.

// ─── Button ────────────────────────────────────────────────
const ButtonProps = z
  .object({
    variant: z.enum(['primary', 'default', 'ghost']).optional(),
    size: z.enum(['sm', 'md', 'lg']).optional(),
    icon: z.string().optional(),
    value: z.unknown().optional().describe('Optional payload sent on click (e.g. a row id), so one ref can serve many rows.'),
  })
  .strict();

type ButtonP = z.infer<typeof ButtonProps> & { novaRef?: string; children?: ReactNode };

export const Button: NovaComponent<z.infer<typeof ButtonProps>> = ({
  variant = 'default',
  size = 'md',
  icon,
  value,
  novaRef,
  children,
}: ButtonP) => {
  const dispatch = useNovaDispatch();
  return (
    <button
      className={cx('rl-btn', `rl-btn--${variant}`, size !== 'md' && `rl-btn--${size}`)}
      onClick={(e) => {
        // Don't bubble to an enclosing clickable row (a table row's `⋯` kebab).
        e.stopPropagation();
        if (novaRef !== undefined) dispatch({ type: 'ui:click', ref: novaRef, payload: value });
      }}
    >
      {icon !== undefined && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
};
Button.meta = {
  description: 'Clickable button. Give it a ref and a trigger to act.',
  propsSchema: ButtonProps,
};

// ─── NavItem ───────────────────────────────────────────────
// Active state is derived: `id` (this item) compared to `activeId` (bound to
// the sidebar's current selection). Click fires ui:click for a trigger.
const NavItemProps = z
  .object({
    id: z.string().optional(),
    activeId: z.string().optional(),
    icon: z.string().optional(),
    label: z.string(),
    count: z.number().optional(),
  })
  .strict();

type NavItemP = z.infer<typeof NavItemProps> & { novaRef?: string };

export const NavItem: NovaComponent<z.infer<typeof NavItemProps>> = ({
  id,
  activeId,
  icon,
  label,
  count,
  novaRef,
}: NavItemP) => {
  const dispatch = useNovaDispatch();
  const active = id !== undefined && id === activeId;
  return (
    <button
      className={cx('rl-navitem', active && 'rl-navitem--active')}
      onClick={() => {
        if (novaRef !== undefined) dispatch({ type: 'ui:click', ref: novaRef });
      }}
    >
      {icon !== undefined && <Icon name={icon} size={16} />}
      {label}
      {count !== undefined && <span className="rl-navitem__count">{count}</span>}
    </button>
  );
};
NavItem.meta = {
  description:
    'A sidebar nav item; active when its id matches the bound activeId. Give it a ref + a trigger.',
  propsSchema: NavItemProps,
};

// ─── Tabs ──────────────────────────────────────────────────
// A compact segmented control (e.g. All / Mine). `value` is the active option
// (bound to data); a click fires `ui:click` carrying the chosen option's value,
// so a trigger can set state + re-run the list query. Pure selection — the open
// list is plain data, visible to the AI.
const TabsProps = z
  .object({
    options: z.array(z.object({ value: z.string(), label: z.string() })),
    value: z.string().optional().describe('The active option value (bind to data).'),
  })
  .strict();

type TabsP = z.infer<typeof TabsProps> & { novaRef?: string };

export const Tabs: NovaComponent<z.infer<typeof TabsProps>> = ({ options, value, novaRef }: TabsP) => {
  const dispatch = useNovaDispatch();
  return (
    <div className="rl-seg">
      {options.map((o) => (
        <button
          key={o.value}
          className={cx('rl-seg__item', value === o.value && 'rl-seg__item--active')}
          onClick={() => {
            if (novaRef !== undefined) dispatch({ type: 'ui:click', ref: novaRef, payload: o.value });
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};
Tabs.meta = { description: 'Segmented control (e.g. All/Mine); active = `value`, fires ui:click with the chosen value.', propsSchema: TabsProps };

// ─── SortHeader ────────────────────────────────────────────
// A clickable table-column header that drives Vex's reserved `sortBy`/`sortDir`
// context keys. `field` is the entity.field this column sorts by; `sortBy` /
// `sortDir` are the live sort state (bound to data). A click fires `ui:click`
// carrying the NEXT sort — same column flips asc↔desc, a new column starts asc —
// so the trigger just `set`s the two values. The ▲/▼ shows on the active column.
const SortHeaderProps = z
  .object({
    label: z.string(),
    field: z.string().describe('The entity.field this column sorts by, e.g. "deals.value".'),
    sortBy: z.string().optional().describe('Current sort field (bind to data).'),
    sortDir: z.string().optional().describe('Current sort direction (bind to data).'),
  })
  .strict();

type SortHeaderP = z.infer<typeof SortHeaderProps> & { novaRef?: string };

export const SortHeader: NovaComponent<z.infer<typeof SortHeaderProps>> = ({ label, field, sortBy, sortDir, novaRef }: SortHeaderP) => {
  const dispatch = useNovaDispatch();
  const active = sortBy === field;
  const nextDir = active && sortDir === 'asc' ? 'desc' : 'asc';
  return (
    <button
      className={cx('rl-th-sort', active && 'rl-th-sort--active')}
      onClick={(e) => {
        e.stopPropagation();
        if (novaRef !== undefined) dispatch({ type: 'ui:click', ref: novaRef, payload: { sortBy: field, sortDir: nextDir } });
      }}
    >
      <span>{label}</span>
      {active && <Icon name={sortDir === 'desc' ? 'arrow-down' : 'arrow-up'} size={12} />}
    </button>
  );
};
SortHeader.meta = { description: 'Clickable column header driving Vex sortBy/sortDir; click flips/sets the sort, ▲/▼ marks the active column.', propsSchema: SortHeaderProps };

// ─── MenuItem ──────────────────────────────────────────────
// One row of a dropdown menu (the row `⋯` menu). Fires `ui:click` with its ref
// (and optional `value`, e.g. the record id) so a trigger can act. `danger`
// tints it red. Styling: .rl-menu__item in ui.css.
const MenuItemProps = z
  .object({
    icon: z.string().optional(),
    danger: z.boolean().optional(),
    value: z.unknown().optional().describe('Payload sent on click (e.g. the record id).'),
  })
  .strict();

type MenuItemP = z.infer<typeof MenuItemProps> & { novaRef?: string; children?: ReactNode };

export const MenuItem: NovaComponent<z.infer<typeof MenuItemProps>> = ({ icon, danger, value, novaRef, children }: MenuItemP) => {
  const dispatch = useNovaDispatch();
  return (
    <button
      className={cx('rl-menu__item', danger === true && 'rl-menu__item--danger')}
      onClick={(e) => {
        e.stopPropagation();
        if (novaRef !== undefined) dispatch({ type: 'ui:click', ref: novaRef, payload: value });
      }}
    >
      {icon !== undefined && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
};
MenuItem.meta = { description: 'A dropdown menu row; fires ui:click with its ref + optional value. `danger` tints red.', propsSchema: MenuItemProps };

// ─── LinkRow ───────────────────────────────────────────────
// A clickable navigation row: hover-highlights and reveals a → chevron, and on
// click fires `ui:click` carrying its bound `value` (e.g. a record id) so a
// trigger can open that record. The standard cross-link affordance for lists
// inside a panel (a company's people/deals, a deal's tasks, …).
const LinkRowProps = z
  .object({
    value: z.unknown().optional().describe('Payload sent on click (e.g. the record id). Needs a ref.'),
  })
  .strict();

type LinkRowP = z.infer<typeof LinkRowProps> & { novaRef?: string; children?: ReactNode };

export const LinkRow: NovaComponent<z.infer<typeof LinkRowProps>> = ({ value, novaRef, children }: LinkRowP) => {
  const dispatch = useNovaDispatch();
  return (
    <div
      className="rl-linkrow"
      onClick={() => {
        if (novaRef !== undefined) dispatch({ type: 'ui:click', ref: novaRef, payload: value });
      }}
    >
      <div className="rl-linkrow__body">{children}</div>
      <span className="rl-linkrow__chev">
        <Icon name="chevron-right" size={15} />
      </span>
    </div>
  );
};
LinkRow.meta = { description: 'Clickable nav row (hover + reveal chevron); fires ui:click with `value`. The one way to link a record.', propsSchema: LinkRowProps };
