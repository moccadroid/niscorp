import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/adapters/react';
import { cx } from '../lib/cx';
import { ALIGN, BG, JUSTIFY, LINE, border, dim } from '../lib/tokens';

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
    shrink: z.boolean().optional().describe('Allow this flex child to shrink below its content (so an inner scroll area works).'),
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
  shrink,
  children,
}) => {
  // The effect has no deps: it runs after every render, so each appended
  // message scrolls the log to the latest.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stickBottom === true && scrollRef.current !== null) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });
  // Only the keys that are set are emitted: beside a shorthand (`padding`,
  // `border`), React writes an undefined longhand as an empty string, which
  // wipes the shorthand.
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
    ...(shrink === true ? { minWidth: 0, minHeight: 0 } : {}),
  };
  return (
    <div ref={scrollRef} style={style}>
      {children}
    </div>
  );
};
Box.meta = {
  description: 'Styling container: padding, background, border (true or a side), radius, glow.',
  propsSchema: BoxProps,
};

const StackProps = z
  .object({
    gap: z.number().optional(),
    pad: z.number().optional(),
    align: z.string().optional(),
    grow: z.boolean().optional(),
    scroll: z.boolean().optional(),
    h: dim,
    shrink: z.boolean().optional().describe('Allow this flex child to shrink below its content (so an inner scroll area works).'),
  })
  .strict();

export const Stack: NovaComponent<z.infer<typeof StackProps>> = ({
  gap,
  pad,
  align,
  grow,
  scroll,
  h,
  shrink,
  children,
}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap,
      padding: pad,
      alignItems: align !== undefined ? ALIGN[align] : undefined,
      flex: grow === true ? 1 : undefined,
      overflow: scroll === true ? 'auto' : undefined,
      minHeight: scroll === true || shrink === true ? 0 : undefined,
      minWidth: shrink === true ? 0 : undefined,
      height: h,
    }}
  >
    {children}
  </div>
);
Stack.meta = { description: 'Vertical flex stack with a gap.', propsSchema: StackProps };

const RowProps = z
  .object({
    gap: z.number().optional(),
    pad: z.number().optional(),
    align: z.string().optional(),
    justify: z.string().optional(),
    grow: z.boolean().optional(),
    wrap: z.boolean().optional(),
    h: dim,
    shrink: z.boolean().optional().describe('Allow this flex child to shrink below its content (so an inner scroll area works).'),
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
  shrink,
  children,
}) => (
  <div
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
      minWidth: shrink === true ? 0 : undefined,
      minHeight: shrink === true ? 0 : undefined,
    }}
  >
    {children}
  </div>
);
Row.meta = { description: 'Horizontal flex row with a gap.', propsSchema: RowProps };

const GridProps = z
  .object({
    weights: z
      .array(z.union([z.number(), z.literal('auto')]))
      .optional()
      .describe('One entry per column: a number is a flexible fraction (2 = twice as wide as 1), "auto" hugs content.'),
    columns: z.number().optional().describe('Equal-width column count (ignored when weights is set).'),
    gap: z.number().optional(),
    align: z.string().optional(),
    hover: z.boolean().optional(),
    selected: z.boolean().optional().describe('Marks the row as selected (e.g. the record open in the detail panel).'),
    border,
    value: z
      .unknown()
      .optional()
      .describe('Payload sent on click (e.g. the row record). Needs a ref.'),
  })
  .strict();

type GridP = z.infer<typeof GridProps> & { novaRef?: string; children?: ReactNode };

export const Grid: NovaComponent<z.infer<typeof GridProps>> = ({
  weights,
  columns,
  gap,
  align,
  hover,
  selected,
  border,
  value,
  novaRef,
  children,
}: GridP) => {
  const dispatch = useNovaDispatch();
  const clickable = novaRef !== undefined;
  const cols =
    weights !== undefined
      ? weights.map((w) => (w === 'auto' ? 'auto' : `${w}fr`)).join(' ')
      : columns !== undefined
        ? `repeat(${columns}, 1fr)`
        : 'repeat(2, 1fr)';
  return (
    <div
      className={cx(hover === true && 'rl-rowhover', selected === true && 'rl-rowselected')}
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
    'CSS grid. `weights` sets column proportions (numbers = fractions, "auto" hugs); `hover` highlights rows; with a `ref` it is clickable and emits its `value`.',
  propsSchema: GridProps,
};

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
  // A click inside the popover must not also fire an enclosing clickable row.
  return (
    <div className="rl-popover" ref={ref} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
};
Popover.meta = {
  description: 'Positioning anchor for a floating panel (a PopoverPanel child); `closeRef` dismisses on outside click.',
  propsSchema: PopoverProps,
};

const PopoverPanelProps = z.object({}).strict();

export const PopoverPanel: NovaComponent<z.infer<typeof PopoverPanelProps>> = ({
  children,
}: z.infer<typeof PopoverPanelProps> & { children?: ReactNode }) => (
  <div className="rl-popover__panel">{children}</div>
);
PopoverPanel.meta = {
  description: 'The floating panel inside a Popover — positioned beneath the trigger.',
  propsSchema: PopoverPanelProps,
};
