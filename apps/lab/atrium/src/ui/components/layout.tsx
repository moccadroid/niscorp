import type { CSSProperties, ReactNode } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/adapters/react';
import { cx } from '../lib/cx';
import { ALIGN, BG, JUSTIFY, LINE, border, dim } from '../lib/tokens';

// Layout primitives. Thin styled divs that turn JSON props into inline styles.
// Domain-blind by construction: none of them knows what a stay or a capability
// is, and none imports the shell, an action or a data module.

const BoxProps = z
  .object({
    pad: z.number().optional(),
    px: z.number().optional(),
    py: z.number().optional(),
    bg: z.string().optional(),
    border,
    radius: z.number().optional(),
    grow: z.boolean().optional(),
    scroll: z.boolean().optional(),
    stickBottom: z.boolean().optional().describe('Keep a scroll container pinned to the bottom as content grows (a message thread).'),
    center: z.boolean().optional(),
    width: dim,
    maxWidth: dim,
    h: dim,
    shrink: z.boolean().optional(),
  })
  .strict();

export const Box: NovaComponent<z.infer<typeof BoxProps>> = ({ pad, px, py, bg, border, radius, grow, scroll, stickBottom, center, width, maxWidth, h, shrink, children }) => {
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
    ...(grow === true ? { flex: 1 } : {}),
    ...(center === true ? { display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(maxWidth !== undefined ? { maxWidth, marginLeft: 'auto', marginRight: 'auto' } : {}),
    ...(h !== undefined ? { height: h } : {}),
    ...(shrink === true ? { minWidth: 0, minHeight: 0 } : {}),
  };
  const cls = cx(scroll === true && 'at-scroll');
  // A thread pins itself to the newest line. `key` on the inner spacer is not
  // enough — the browser needs the scroll set after layout, every paint.
  return (
    <div className={cls} style={style} ref={stickBottom === true ? (el) => { if (el !== null) el.scrollTop = el.scrollHeight; } : undefined}>
      {children}
    </div>
  );
};
Box.meta = { description: 'Styling container: padding, background, border (true or a side), radius, width caps, scroll.', propsSchema: BoxProps };

const StackProps = z
  .object({ gap: z.number().optional(), pad: z.number().optional(), px: z.number().optional(), py: z.number().optional(), align: z.string().optional(), grow: z.boolean().optional(), scroll: z.boolean().optional(), h: dim, maxWidth: dim, shrink: z.boolean().optional() })
  .strict();

export const Stack: NovaComponent<z.infer<typeof StackProps>> = ({ gap, pad, px, py, align, grow, scroll, h, maxWidth, shrink, children }) => (
  <div
    className={cx(scroll === true && 'at-scroll')}
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap,
      padding: pad,
      ...(px !== undefined ? { paddingLeft: px, paddingRight: px } : {}),
      ...(py !== undefined ? { paddingTop: py, paddingBottom: py } : {}),
      alignItems: align !== undefined ? ALIGN[align] : undefined,
      flex: grow === true ? 1 : undefined,
      minHeight: scroll === true || shrink === true ? 0 : undefined,
      minWidth: shrink === true ? 0 : undefined,
      height: h,
      ...(maxWidth !== undefined ? { maxWidth, marginLeft: 'auto', marginRight: 'auto', width: '100%' } : {}),
    }}
  >
    {children}
  </div>
);
Stack.meta = { description: 'Vertical flex stack with a gap.', propsSchema: StackProps };

const RowProps = z
  .object({ gap: z.number().optional(), pad: z.number().optional(), px: z.number().optional(), py: z.number().optional(), align: z.string().optional(), justify: z.string().optional(), grow: z.boolean().optional(), wrap: z.boolean().optional(), h: dim, shrink: z.boolean().optional() })
  .strict();

export const Row: NovaComponent<z.infer<typeof RowProps>> = ({ gap, pad, px, py, align = 'center', justify, grow, wrap, h, shrink, children }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'row',
      gap,
      padding: pad,
      ...(px !== undefined ? { paddingLeft: px, paddingRight: px } : {}),
      ...(py !== undefined ? { paddingTop: py, paddingBottom: py } : {}),
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
    min: z.number().optional().describe('Minimum column width — the grid fits as many as will go, then wraps. This is how a shell reflows from a phone to a desk without a breakpoint.'),
    columns: z.number().optional(),
    weights: z.array(z.union([z.number(), z.literal('auto')])).optional(),
    gap: z.number().optional(),
    align: z.string().optional(),
    hover: z.boolean().optional(),
    border,
    value: z.unknown().optional().describe('Payload sent on click. Needs a ref.'),
  })
  .strict();

type GridP = z.infer<typeof GridProps> & { novaRef?: string; children?: ReactNode };

export const Grid: NovaComponent<z.infer<typeof GridProps>> = ({ min, columns, weights, gap, align, hover, border, value, novaRef, children }: GridP) => {
  const dispatch = useNovaDispatch();
  const clickable = novaRef !== undefined;
  const cols =
    min !== undefined
      ? `repeat(auto-fit, minmax(${min}px, 1fr))`
      : weights !== undefined
        ? weights.map((w) => (w === 'auto' ? 'auto' : `${w}fr`)).join(' ')
        : columns !== undefined
          ? `repeat(${columns}, 1fr)`
          : 'repeat(2, 1fr)';
  return (
    <div
      className={cx(hover === true && 'at-row at-row--hover')}
      style={{
        display: 'grid',
        gridTemplateColumns: cols,
        gap,
        alignItems: align !== undefined ? ALIGN[align] : undefined,
        borderBottom: border === 'bottom' || border === true ? LINE : undefined,
        cursor: clickable ? 'pointer' : undefined,
      }}
      onClick={clickable ? () => dispatch({ type: 'ui:click', ref: novaRef, payload: value }) : undefined}
    >
      {children}
    </div>
  );
};
Grid.meta = { description: 'CSS grid. `min` auto-fits columns (phone → desk with no breakpoint); `weights` sets proportions; with a `ref` it is clickable and emits its `value`.', propsSchema: GridProps };

// A named region of the frame, for the stylesheet to address. The frame is
// static data with nothing to bind, so any styling that depends on session
// state (the assistant's territory) selects on a document-root attribute and
// lands on these names. Draws nothing of its own.
const RegionProps = z.object({ name: z.string() }).strict();

export const Region: NovaComponent<z.infer<typeof RegionProps>> = ({ name, children }: z.infer<typeof RegionProps> & { children?: ReactNode }) => (
  <div className={`at-region at-region--${name}`}>{children}</div>
);
Region.meta = { description: 'A named frame region the stylesheet can address. Frames only.', propsSchema: RegionProps };

// Wraps content that just arrived: plays one arrival sheen on mount, inert
// after. Composed by the `landed` fragment onto what the assistant places —
// mounting is what makes the timing honest, so this carries no state.
const LandedProps = z.object({}).strict();

export const Landed: NovaComponent<z.infer<typeof LandedProps>> = ({ children }: z.infer<typeof LandedProps> & { children?: ReactNode }) => (
  <div className="at-landed">{children}</div>
);
Landed.meta = { description: 'Plays one arrival sheen over its content when it enters, then is inert.', propsSchema: LandedProps };
