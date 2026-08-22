import { useState } from 'react';
import { z } from 'zod';
import { type NovaComponent } from '@niscorp/nova/adapters/react';
import type { ActionInstance } from '@niscorp/nova';
import { cx } from '../lib/cx';
import { navBack, navPopTo } from '@relay/lib/nav';
import { Icon } from './display';

// The stack context chip — per-canvas trail rendered by a canvas's
// actionLayout. It reads the canvas's own stack (the resolved `$.instances`,
// each carrying its `title`) and NAVIGATES through the browser's own back
// gesture: `history.back()` lands in the terminal's back trap (one spare
// history entry, moss/terminal/history.ts), travels the wire as `back`, and
// the SERVER shell — the owner of navigation — walks its journal. One press
// per level: an ancestor jump is that many presses, spaced so each popstate
// settles before the next. No shell in the browser, same as ever; the chip
// borrows the gesture that already works instead of inventing a channel.

const StackChipProps = z.object({
  // The canvas stack, passed from the actionLayout scope as `$.instances`.
  instances: z.array(z.any()).optional(),
  // Which canvas this chip belongs to — a popTo names its stack.
  canvasId: z.string().optional(),
}).strict();

type Inst = ActionInstance & { title?: string };
const label = (i: Inst): string => i.title ?? i.definitionId;

export const StackChip: NovaComponent<z.infer<typeof StackChipProps>> = ({ instances = [], canvasId = 'main' }) => {
  const [open, setOpen] = useState(false);
  const stack = instances as Inst[];
  const parent = stack[stack.length - 2];
  const root = stack[0];
  if (parent === undefined || root === undefined) return null; // depth < 2 → nothing to go back to

  return (
    <div className="rl-chip">
      <span
        className="rl-chip__back"
        title={`Back to ${label(parent)}`}
        role="button"
        style={{ cursor: 'pointer' }}
        onClick={() => navBack()}
      >
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
                <span
                  key={i.id}
                  className={cx('rl-chip__row', current && 'rl-chip__row--current')}
                  {...(current
                    ? {}
                    : {
                        role: 'button',
                        style: { cursor: 'pointer' },
                        onClick: () => {
                          setOpen(false);
                          // ONE message, executed atomically by the shell that
                          // owns the stack. This used to be `steps` chained
                          // back gestures, which raced the browser's history
                          // repair and delivered one of N.
                          navPopTo(canvasId, i.id);
                        },
                      })}
                >
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
