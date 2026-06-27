import { useState } from 'react';
import { z } from 'zod';
import { useShell, type NovaComponent } from '@niscorp/nova/react';
import type { ActionInstance } from '@niscorp/nova';
import { cx } from '../lib/cx';
import { Icon } from './display';

// The stack context chip — per-canvas navigation rendered by a canvas's
// actionLayout. It reads the canvas's own stack (the resolved `$.instances`,
// each carrying its `title`) and drives navigation through the shell directly:
// the back button pops one (to the parent); the depth menu jumps to any
// ancestor via popTo. No triggers, no effects — `useShell` is the whole wiring.
// Appears only once the canvas is drilled (depth ≥ 2); a base screen shows none.

const StackChipProps = z.object({
  // The canvas stack, passed from the actionLayout scope as `$.instances`.
  instances: z.array(z.any()).optional(),
}).strict();

type Inst = ActionInstance & { title?: string };
const label = (i: Inst): string => i.title ?? i.definitionId;

export const StackChip: NovaComponent<z.infer<typeof StackChipProps>> = ({ instances = [] }) => {
  const shell = useShell();
  const [open, setOpen] = useState(false);
  const stack = instances as Inst[];
  const parent = stack[stack.length - 2];
  const root = stack[0];
  if (parent === undefined || root === undefined) return null; // depth < 2 → nothing to go back to

  const canvasId = root.canvasId;

  return (
    <div className="rl-chip">
      <button className="rl-chip__back" onClick={() => shell.pop(canvasId)} title={`Back to ${label(parent)}`}>
        <Icon name="chevron-left" size={15} />
        <span className="rl-chip__name">{label(parent)}</span>
      </button>
      <button className="rl-chip__more" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{stack.length}</span>
        <Icon name="chevron-down" size={13} />
      </button>
      {open && (
        <>
          <div className="rl-chip__backdrop" onClick={() => setOpen(false)} />
          <div className="rl-chip__menu">
            {stack.map((i, idx) => {
              const current = idx === stack.length - 1;
              return (
                <button
                  key={i.id}
                  type="button"
                  disabled={current}
                  className={cx('rl-chip__row', current && 'rl-chip__row--current')}
                  onClick={() => {
                    setOpen(false);
                    shell.popTo(canvasId, i.id);
                  }}
                >
                  {label(i)}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
StackChip.meta = {
  description: 'Stack context chip — back to parent + a depth menu that jumps to any ancestor.',
  propsSchema: StackChipProps,
};
