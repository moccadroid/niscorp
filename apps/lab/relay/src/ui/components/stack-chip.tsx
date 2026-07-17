import { useState } from 'react';
import { z } from 'zod';
import { type NovaComponent } from '@niscorp/nova/react';
import type { ActionInstance } from '@niscorp/nova';
import { cx } from '../lib/cx';
import { Icon } from './display';

// The stack context chip — per-canvas trail rendered by a canvas's
// actionLayout. It reads the canvas's own stack (the resolved `$.instances`,
// each carrying its `title`). DISPLAY-ONLY for now: how stack navigation
// serializes over the wire (the shell is server-side) is an open design —
// until it is ruled, the trail shows where you are; it does not navigate.

const StackChipProps = z.object({
  // The canvas stack, passed from the actionLayout scope as `$.instances`.
  instances: z.array(z.any()).optional(),
}).strict();

type Inst = ActionInstance & { title?: string };
const label = (i: Inst): string => i.title ?? i.definitionId;

export const StackChip: NovaComponent<z.infer<typeof StackChipProps>> = ({ instances = [] }) => {
  const [open, setOpen] = useState(false);
  const stack = instances as Inst[];
  const parent = stack[stack.length - 2];
  const root = stack[0];
  if (parent === undefined || root === undefined) return null; // depth < 2 → nothing to go back to

  return (
    <div className="rl-chip">
      <span className="rl-chip__back" title={`Under ${label(parent)}`}>
        <Icon name="chevron-left" size={15} />
        <span className="rl-chip__name">{label(parent)}</span>
      </span>
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
                <span key={i.id} className={cx('rl-chip__row', current && 'rl-chip__row--current')}>
                  {label(i)}
                </span>
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
