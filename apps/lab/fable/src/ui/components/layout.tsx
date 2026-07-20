import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/adapters/react';
import { ALIGN, JUSTIFY, LINE, border, dim } from '../lib/tokens';

// Layout primitives — Box, Stack, Row, Popover. Thin styled divs that turn
// JSON props into inline styles. No feature logic.

// ─── Box ───────────────────────────────────────────────────
const BoxProps = z
  .object({
    pad: z.number().optional(),
    px: z.number().optional(),
    py: z.number().optional(),
    border,
    radius: z.number().optional(),
    grow: z.boolean().optional(),
    scroll: z.boolean().optional(),
    center: z.boolean().optional(),
    width: dim,
    h: dim,
    class: z.string().optional().describe('A CSS class from the kit (ui.css), e.g. "fb-dialog". Escape hatch for kit chrome.'),
  })
  .strict();

export const Box: NovaComponent<z.infer<typeof BoxProps>> = ({
  pad,
  px,
  py,
  border,
  radius,
  grow,
  scroll,
  center,
  width,
  h,
  class: cls,
  children,
}) => {
  // Only emit the keys that are actually set. Mixing a shorthand (`border`)
  // with undefined longhands makes React write the longhands as empty
  // strings, which wipes the shorthand — so build the style additively.
  const style: CSSProperties = {
    ...(pad !== undefined ? { padding: pad } : {}),
    ...(px !== undefined ? { paddingLeft: px, paddingRight: px } : {}),
    ...(py !== undefined ? { paddingTop: py, paddingBottom: py } : {}),
    ...(border === true ? { border: LINE } : {}),
    ...(border === 'top' ? { borderTop: LINE } : {}),
    ...(border === 'bottom' ? { borderBottom: LINE } : {}),
    ...(border === 'left' ? { borderLeft: LINE } : {}),
    ...(border === 'right' ? { borderRight: LINE } : {}),
    ...(radius !== undefined ? { borderRadius: radius } : {}),
    ...(grow === true ? { flex: 1 } : {}),
    ...(center === true ? { display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}),
    ...(scroll === true ? { overflow: 'auto', minHeight: 0 } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(h !== undefined ? { height: h } : {}),
  };
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
};
Box.meta = {
  description: 'Styling container: padding, border (true or a side), radius, or a kit `class`.',
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
    class: z.string().optional().describe('A CSS class from the kit (e.g. "fb-min0" for a flex child that must shrink/scroll).'),
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
    class: z.string().optional().describe('A CSS class from the kit.'),
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

// ─── Popover ───────────────────────────────────────────────
// A positioning anchor for a floating panel (the row ⋯ menu). Whether the
// panel renders is a layout conditional over data, so the open state stays
// visible as data. The one bit of behaviour: `closeRef` — a mousedown outside
// the popover fires `ui:click` with that ref, so a trigger can dismiss it.
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
      if (ref.current !== null && e.target instanceof Node && !ref.current.contains(e.target)) {
        dispatch({ type: 'ui:click', ref: closeRef });
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [closeRef, dispatch]);
  // Clicks inside the popover are self-contained — stop them bubbling so an
  // enclosing clickable element does not also fire.
  return (
    <div className="fb-popover" ref={ref} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
};
Popover.meta = {
  description: 'Positioning anchor for a floating panel (.fb-popover__panel); `closeRef` dismisses on outside click.',
  propsSchema: PopoverProps,
};
