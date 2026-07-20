import { type ReactNode } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/adapters/react';
import { cx } from '../lib/cx';
import { Icon } from './display';

// Interactive primitives — Button, Tabs, MenuItem. Each fires `ui:click`
// carrying the node's ref (injected as novaRef) for a trigger to match.

// ─── Button ────────────────────────────────────────────────
const ButtonProps = z
  .object({
    variant: z.enum(['primary', 'default', 'ghost', 'danger']).optional(),
    size: z.enum(['sm', 'md']).optional(),
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
      className={cx('fb-btn', `fb-btn--${variant}`, size !== 'md' && `fb-btn--${size}`)}
      onClick={(e) => {
        // Don't bubble to an enclosing clickable row (the ⋯ kebab lives in one).
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

// ─── Tabs ──────────────────────────────────────────────────
// A compact segmented control (Open / Today / Done). `value` is the active
// option (bound to data); a click fires `ui:click` carrying the chosen
// option's value, so a trigger can set state + re-run the list query.
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
    <div className="fb-seg">
      {options.map((o) => (
        <button
          key={o.value}
          className={cx('fb-seg__item', value === o.value && 'fb-seg__item--active')}
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
Tabs.meta = { description: 'Segmented control; active = `value`, fires ui:click with the chosen value.', propsSchema: TabsProps };

// ─── MenuItem ──────────────────────────────────────────────
// One row of a dropdown menu (the row ⋯ menu). Fires `ui:click` with its ref
// (and optional `value`, e.g. the whole row) so a trigger can act. `danger`
// tints it red.
const MenuItemProps = z
  .object({
    icon: z.string().optional(),
    danger: z.boolean().optional(),
    value: z.unknown().optional().describe('Payload sent on click (e.g. the row record).'),
  })
  .strict();

type MenuItemP = z.infer<typeof MenuItemProps> & { novaRef?: string; children?: ReactNode };

export const MenuItem: NovaComponent<z.infer<typeof MenuItemProps>> = ({ icon, danger, value, novaRef, children }: MenuItemP) => {
  const dispatch = useNovaDispatch();
  return (
    <button
      className={cx('fb-menu__item', danger === true && 'fb-menu__item--danger')}
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
