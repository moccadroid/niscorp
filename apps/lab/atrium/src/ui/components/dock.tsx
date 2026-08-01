import type { ReactNode } from 'react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { cx } from '../lib/cx';

// The dock — a fixed bottom-anchored surface, designed for a phone first: a
// pill within thumb reach that expands into a panel over the content. On a wide
// screen the same panel anchors bottom-right instead of full-width; that is the
// desktop getting lucky, not a second design. Domain-blind: it positions and
// frames, the layout decides everything inside.
//
// `side` and `wide` are corners and sizes, which is the only kind of decision
// this component is allowed to carry. Two docks can therefore share one screen
// without knowing about each other — and in this app two do, served by two
// different processes to two different audiences.
const DockProps = z
  .object({
    open: z.boolean().optional(),
    side: z.enum(['left', 'right']).optional().describe('Which bottom corner it anchors to. Default right.'),
    wide: z.boolean().optional().describe('A working panel rather than a conversation — wider on a desktop.'),
  })
  .strict();

export const Dock: NovaComponent<z.infer<typeof DockProps>> = ({ open, side = 'right', wide, children }: z.infer<typeof DockProps> & { children?: ReactNode }) => (
  <div className={cx('at-dock', `at-dock--${side}`, open === true && 'at-dock--open', wide === true && 'at-dock--wide')}>
    {open === true ? <div className="at-dock__panel">{children}</div> : children}
  </div>
);
Dock.meta = { description: 'Fixed bottom-anchored surface: a pill that expands into a panel. Mobile-first; frames only.', propsSchema: DockProps };
