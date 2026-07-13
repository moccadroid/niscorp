import { useEffect, useRef, type ReactNode } from 'react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/react';
import { cx } from '../lib/cx';

// Chrome components — dialogs, panels, rails, kanban scaffolding, small
// decorated atoms. Every kit CSS class is applied HERE, internally: a layout
// declares WHAT a thing is via simple props; it never names a class or a
// style. The global stylesheet (ui.css) is these components' private business.

// ─── Dialog family ─────────────────────────────────────────

const DialogProps = z
  .object({
    size: z.enum(['narrow', 'wide']).optional().describe('Card width: narrow (confirm), wide (record/quickview). Default form width.'),
    panel: z.boolean().optional().describe('Panel mode: relative positioning so a PanelClose can float in the corner.'),
  })
  .strict();

export const Dialog: NovaComponent<z.infer<typeof DialogProps>> = ({ size, panel, children }) => (
  <div className={cx('rl-dialog', size !== undefined && `rl-dialog--${size}`, panel === true && 'rl-panel')}>
    {children}
  </div>
);
Dialog.meta = { description: 'The dialog/panel card: column flexbox capped at the viewport.', propsSchema: DialogProps };

const EMPTY_PROPS = z.object({}).strict();

export const DialogHead: NovaComponent<z.infer<typeof EMPTY_PROPS>> = ({ children }) => (
  <div className="rl-dialog__head">{children}</div>
);
DialogHead.meta = { description: 'Dialog header row (title left, controls right).', propsSchema: EMPTY_PROPS };

export const DialogTitle: NovaComponent<z.infer<typeof EMPTY_PROPS>> = ({ children }) => (
  <div className="rl-dialog__title">{children}</div>
);
DialogTitle.meta = { description: 'Dialog title text (truncates).', propsSchema: EMPTY_PROPS };

const DialogBodyProps = z
  .object({
    grow: z.boolean().optional(),
    stickBottom: z.boolean().optional().describe('Keep the body pinned to the bottom as content grows (a chat log).'),
  })
  .strict();

export const DialogBody: NovaComponent<z.infer<typeof DialogBodyProps>> = ({ grow, stickBottom, children }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stickBottom === true && scrollRef.current !== null) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });
  return (
    <div ref={scrollRef} className="rl-dialog__body" style={grow === true ? { flex: 1 } : undefined}>
      {children}
    </div>
  );
};
DialogBody.meta = { description: 'Dialog body: padded, scrolls when tall.', propsSchema: DialogBodyProps };

export const DialogFoot: NovaComponent<z.infer<typeof EMPTY_PROPS>> = ({ children }) => (
  <div className="rl-dialog__foot">{children}</div>
);
DialogFoot.meta = { description: 'Dialog footer: right-aligned action buttons.', propsSchema: EMPTY_PROPS };

export const PanelClose: NovaComponent<z.infer<typeof EMPTY_PROPS>> = ({ children }) => (
  <div className="rl-panel__close">{children}</div>
);
PanelClose.meta = { description: 'Floating close-button slot in a panel Dialog\'s corner.', propsSchema: EMPTY_PROPS };

// ─── Form footer ───────────────────────────────────────────

export const FormFoot: NovaComponent<z.infer<typeof EMPTY_PROPS>> = ({ children }) => (
  <div className="rl-form__foot">{children}</div>
);
FormFoot.meta = { description: 'A form\'s own footer (Cancel + Confirm), bordered, right-aligned.', propsSchema: EMPTY_PROPS };

// ─── Shell rails ───────────────────────────────────────────

export const Aside: NovaComponent<z.infer<typeof EMPTY_PROPS>> = ({ children }) => (
  <div className="rl-aside">{children}</div>
);
Aside.meta = { description: 'The right detail rail; sized by the shell, collapses when empty.', propsSchema: EMPTY_PROPS };

export const AssistantDock: NovaComponent<z.infer<typeof EMPTY_PROPS>> = ({ children }) => (
  <div className="rl-assistant">{children}</div>
);
AssistantDock.meta = { description: 'The right-docked assistant panel (screen stays visible beside it).', propsSchema: EMPTY_PROPS };

// ─── Small decorated atoms ─────────────────────────────────

const ProgressProps = z
  .object({
    value: z.union([z.number(), z.string()]).describe('Fill width — a percent like "64%" (bind or interpolate from data).'),
  })
  .strict();

export const Progress: NovaComponent<z.infer<typeof ProgressProps>> = ({ value }) => (
  <div className="rl-bar">
    <div className="rl-bar__fill" style={{ width: value }} />
  </div>
);
Progress.meta = { description: 'A slim progress bar (e.g. win probability). `value` is the fill percent.', propsSchema: ProgressProps };

const ActivityDotProps = z
  .object({
    tone: z.string().describe('Colour tone (green, blue, amber, pink, slate) — usually bound from data.'),
  })
  .strict();

export const ActivityDot: NovaComponent<z.infer<typeof ActivityDotProps>> = ({ tone, children }) => (
  <div className={cx('rl-actdot', `rl-actdot--${tone}`)}>{children}</div>
);
ActivityDot.meta = { description: 'A coloured circle holding a type icon (activity feeds read by colour).', propsSchema: ActivityDotProps };

// ─── Kanban scaffolding ────────────────────────────────────

const KanbanBoardProps = z
  .object({
    grow: z.boolean().optional(),
    shrink: z.boolean().optional().describe('Allow the board to shrink below its content so it scrolls horizontally.'),
  })
  .strict();

export const KanbanBoard: NovaComponent<z.infer<typeof KanbanBoardProps>> = ({ grow, shrink, children }) => (
  <div
    className="rl-kanban"
    style={{
      ...(grow === true ? { flex: 1 } : {}),
      ...(shrink === true ? { minWidth: 0, minHeight: 0 } : {}),
    }}
  >
    {children}
  </div>
);
KanbanBoard.meta = { description: 'The kanban board row: columns side by side, scrolls horizontally.', propsSchema: KanbanBoardProps };

const KanbanColumnProps = z
  .object({
    tone: z.string().optional().describe('Stage colour accent (green, blue, amber, pink, slate) — usually bound from data.'),
  })
  .strict();

export const KanbanColumn: NovaComponent<z.infer<typeof KanbanColumnProps>> = ({ tone, children }) => (
  <div className={cx('rl-kanban__col', tone !== undefined && `rl-kanban__col--${tone}`)}>{children}</div>
);
KanbanColumn.meta = { description: 'One kanban column (head + cards), with a stage-coloured top accent.', propsSchema: KanbanColumnProps };

export const KanbanHead: NovaComponent<z.infer<typeof EMPTY_PROPS>> = ({ children }) => (
  <div className="rl-kanban__head">{children}</div>
);
KanbanHead.meta = { description: 'A kanban column\'s header row (title left, total right).', propsSchema: EMPTY_PROPS };
