import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/react';
import { cx } from '../lib/cx';
import { ALIGN, BG, JUSTIFY, LINE, border, dim } from '../lib/tokens';

// Layout primitives — Box, Stack, Row, Grid. Thin styled divs that turn JSON
// props into inline styles. No feature logic.

// ─── Box ───────────────────────────────────────────────────
const BoxProps = z
  .object({
    pad: z.number().optional(),
    px: z.number().optional(),
    py: z.number().optional(),
    bg: z.string().optional(),
    border,
    radius: z.number().optional(),
    glow: z.boolean().optional(),
    grow: z.boolean().optional(),
    scroll: z.boolean().optional(),
    stickBottom: z.boolean().optional().describe('Keep a scroll container pinned to the bottom as content grows (e.g. a chat log).'),
    center: z.boolean().optional(),
    width: dim,
    h: dim,
    class: z.string().optional().describe('A CSS class from the kit (ui.css), e.g. "rl-dialog". Escape hatch for kit chrome.'),
  })
  .strict();

export const Box: NovaComponent<z.infer<typeof BoxProps>> = ({
  pad,
  px,
  py,
  bg,
  border,
  radius,
  glow,
  grow,
  scroll,
  stickBottom,
  center,
  width,
  h,
  class: cls,
  children,
}) => {
  // Pin to the bottom as content grows — re-runs every render (no deps), so each
  // appended message scrolls the log to the latest.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stickBottom === true && scrollRef.current !== null) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });
  // Only emit the keys that are actually set. Mixing a shorthand (`padding`,
  // `border`) with undefined longhands makes React write the longhands as
  // empty strings, which wipes the shorthand — so build the style additively.
  const style: CSSProperties = {
    ...(pad !== undefined ? { padding: pad } : {}),
    ...(px !== undefined ? { paddingLeft: px, paddingRight: px } : {}),
    ...(py !== undefined ? { paddingTop: py, paddingBottom: py } : {}),
    ...(bg !== undefined ? { background: BG[bg] ?? bg } : {}),
    ...(border === true ? { border: LINE } : {}),
    ...(border === 'top' ? { borderTop: LINE } : {}),
    ...(border === 'bottom' ? { borderBottom: LINE } : {}),
    ...(border === 'left' ? { borderLeft: LINE } : {}),
    ...(border === 'right' ? { borderRight: LINE } : {}),
    ...(radius !== undefined ? { borderRadius: radius } : {}),
    ...(glow === true ? { boxShadow: 'var(--accent-glow)' } : {}),
    ...(grow === true ? { flex: 1 } : {}),
    ...(center === true ? { display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}),
    ...(scroll === true ? { overflow: 'auto', minHeight: 0 } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(h !== undefined ? { height: h } : {}),
  };
  return (
    <div ref={scrollRef} className={cls} style={style}>
      {children}
    </div>
  );
};
Box.meta = {
  description: 'Styling container: padding, background, border (true or a side), radius, glow, or a kit `class`.',
  propsSchema: BoxProps,
};

// ─── Stack (column) ────────────────────────────────────────
const StackProps = z
  .object({
    gap: z.number().optional(),
    pad: z.number().optional(),
    align: z.string().optional(),
    grow: z.boolean().optional(),
    scroll: z.boolean().optional(),
    h: dim,
    class: z.string().optional().describe('A CSS class from the kit (e.g. "rl-min0" for a flex child that must shrink/scroll).'),
  })
  .strict();

export const Stack: NovaComponent<z.infer<typeof StackProps>> = ({
  gap,
  pad,
  align,
  grow,
  scroll,
  h,
  class: cls,
  children,
}) => (
  <div
    className={cls}
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap,
      padding: pad,
      alignItems: align !== undefined ? ALIGN[align] : undefined,
      flex: grow === true ? 1 : undefined,
      overflow: scroll === true ? 'auto' : undefined,
      minHeight: scroll === true ? 0 : undefined,
      height: h,
    }}
  >
    {children}
  </div>
);
Stack.meta = { description: 'Vertical flex stack with a gap.', propsSchema: StackProps };

// ─── Row ───────────────────────────────────────────────────
const RowProps = z
  .object({
    gap: z.number().optional(),
    pad: z.number().optional(),
    align: z.string().optional(),
    justify: z.string().optional(),
    grow: z.boolean().optional(),
    wrap: z.boolean().optional(),
    h: dim,
    class: z.string().optional().describe('A CSS class from the kit (e.g. "rl-min0" for a flex child that must shrink/scroll).'),
  })
  .strict();

export const Row: NovaComponent<z.infer<typeof RowProps>> = ({
  gap,
  pad,
  align = 'center',
  justify,
  grow,
  wrap,
  h,
  class: cls,
  children,
}) => (
  <div
    className={cls}
    style={{
      display: 'flex',
      flexDirection: 'row',
      gap,
      padding: pad,
      alignItems: ALIGN[align],
      justifyContent: justify !== undefined ? JUSTIFY[justify] : undefined,
      flex: grow === true ? 1 : undefined,
      flexWrap: wrap === true ? 'wrap' : undefined,
      height: h,
    }}
  >
    {children}
  </div>
);
Row.meta = { description: 'Horizontal flex row with a gap.', propsSchema: RowProps };

// ─── Grid ──────────────────────────────────────────────────
// A Grid with a `ref` becomes clickable and dispatches `ui:click` carrying its
// bound `value` as the payload — that's how a table row hands its record to a
// trigger (which can then push/replace it onto another canvas).
const GridProps = z
  .object({
    template: z.string().optional(),
    columns: z.number().optional(),
    gap: z.number().optional(),
    align: z.string().optional(),
    hover: z.boolean().optional(),
    selected: z.boolean().optional().describe('Marks the row as selected (e.g. the record open in the detail panel).'),
    border,
    class: z
      .string()
      .optional()
      .describe('A CSS class from the kit (ui.css) that defines the columns — e.g. "rl-cols-deals". When set (and no `template`), the columns come from CSS, so they can reflow responsively per container width.'),
    value: z
      .unknown()
      .optional()
      .describe('Payload sent on click (e.g. the row record). Needs a ref.'),
  })
  .strict();

type GridP = z.infer<typeof GridProps> & { novaRef?: string; children?: ReactNode };

export const Grid: NovaComponent<z.infer<typeof GridProps>> = ({
  template,
  columns,
  gap,
  align,
  hover,
  selected,
  border,
  class: cls,
  value,
  novaRef,
  children,
}: GridP) => {
  const dispatch = useNovaDispatch();
  const clickable = novaRef !== undefined;
  // Columns come from `template`, else an explicit `columns` count, else a CSS
  // `class` (left unset inline so the class — and its media/container queries —
  // wins), else a 2-up default.
  const cols =
    template ?? (columns !== undefined ? `repeat(${columns}, 1fr)` : cls !== undefined ? undefined : 'repeat(2, 1fr)');
  return (
    <div
      className={cx(cls, hover === true && 'rl-rowhover', selected === true && 'rl-rowselected')}
      style={{
        display: 'grid',
        gridTemplateColumns: cols,
        gap,
        alignItems: align !== undefined ? ALIGN[align] : undefined,
        borderBottom: border === 'bottom' || border === true ? LINE : undefined,
        cursor: clickable ? 'pointer' : undefined,
      }}
      onClick={
        clickable ? () => dispatch({ type: 'ui:click', ref: novaRef, payload: value }) : undefined
      }
    >
      {children}
    </div>
  );
};
Grid.meta = {
  description:
    'CSS grid. `template` sets columns; `hover` highlights rows; with a `ref` it is clickable and emits its `value`.',
  propsSchema: GridProps,
};

// ─── Popover ───────────────────────────────────────────────
// A positioning anchor for a floating panel. Children are a trigger + a panel;
// give the panel the `.rl-popover__panel` class and it floats beneath the
// trigger. Whether the panel renders is a layout conditional over data, so the
// open state stays visible to the AI. The one bit of behaviour: `closeRef` — a
// mousedown outside the popover fires `ui:click` with that ref, so a trigger can
// dismiss it (the only thing genuinely needing the DOM).
const PopoverProps = z
  .object({ closeRef: z.string().optional().describe('Ref fired as ui:click on an outside click, to dismiss the panel.') })
  .strict();

export const Popover: NovaComponent<z.infer<typeof PopoverProps>> = ({
  closeRef,
  children,
}: z.infer<typeof PopoverProps> & { children?: ReactNode }) => {
  const dispatch = useNovaDispatch();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (closeRef === undefined) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) {
        dispatch({ type: 'ui:click', ref: closeRef });
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [closeRef, dispatch]);
  // Clicks inside the popover (the trigger, the menu items) are self-contained —
  // stop them bubbling so an enclosing clickable row (a table row `⋯` menu) does
  // not also fire.
  return (
    <div className="rl-popover" ref={ref} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
};
Popover.meta = {
  description: 'Positioning anchor for a floating panel (.rl-popover__panel); `closeRef` dismisses on outside click.',
  propsSchema: PopoverProps,
};
