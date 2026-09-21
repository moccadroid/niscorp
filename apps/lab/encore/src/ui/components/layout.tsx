import type { CSSProperties } from 'react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { classes, length, num, oneOf } from './props';
import type { Props } from './props';

// Arrangement primitives. They know about boxes, gaps and columns, and have
// never heard of a stage.

const BOX_TONES = ['plain', 'ground', 'panel', 'sunken', 'calm', 'elevated', 'critical'] as const;

// `tone` doubles as the frame's alarm state: calm / elevated / critical are
// box tones like any other, so the intent line changing colour when a storm is
// typed is a data binding, not a feature of this component.
export const Box: NovaComponent<Props> = ({ children, tone, pad, px, py, h, grow, scroll }) => {
  const style: CSSProperties = {
    padding: length(pad),
    paddingInline: length(px),
    paddingBlock: length(py),
    height: length(h),
    flex: grow === true ? '1 1 0' : undefined,
    minHeight: grow === true ? 0 : undefined,
    overflow: scroll === true ? 'auto' : undefined,
  };
  return (
    <div className={classes('en-box', `en-box--${oneOf(tone, BOX_TONES, 'plain')}`)} style={style}>
      {children}
    </div>
  );
};

// `grow` is a flex weight (true = 1) and `basis` the width it would like before
// growing, `max` the width past which it stops — together they make a Stack a
// COLUMN of a wrapping Row. A Stack with
// nothing in it is removed from the flow by the stylesheet (`:empty`), so a
// column whose every slot rendered nothing leaves no gap behind.
export const Stack: NovaComponent<Props> = ({ children, gap, pad, h, grow, basis, max }) => {
  const weight = grow === true ? 1 : num(grow, 0);
  return (
    <div className="en-stack" style={{ gap: num(gap, 12), padding: length(pad), height: length(h), maxWidth: length(max), flex: weight > 0 ? `${weight} 1 ${length(basis) ?? '0'}` : undefined }}>
      {children}
    </div>
  );
};

const ALIGN: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', baseline: 'baseline' };
const JUSTIFY: Record<string, string> = { start: 'flex-start', between: 'space-between', end: 'flex-end' };

export const Row: NovaComponent<Props> = ({ children, gap, align, justify, wrap }) => (
  <div
    className="en-row"
    style={{
      gap: num(gap, 10),
      alignItems: ALIGN[oneOf(align, ['start', 'center', 'end', 'baseline'], 'center')],
      justifyContent: JUSTIFY[oneOf(justify, ['start', 'between', 'end'], 'start')],
      flexWrap: wrap === true ? 'wrap' : 'nowrap',
    }}
  >
    {children}
  </div>
);

// `columns` is a count or a full template ('1fr 2fr'). Below the
// breakpoint the stylesheet collapses every grid to one column — an ops room on
// a phone is a list.
export const Grid: NovaComponent<Props> = ({ children, columns, gap, align }) => (
  <div
    className="en-grid"
    style={{
      gap: num(gap, 12),
      gridTemplateColumns: typeof columns === 'number' ? `repeat(${columns}, minmax(0, 1fr))` : (length(columns) ?? 'repeat(2, minmax(0, 1fr))'),
      alignItems: oneOf(align, ['start', 'center', 'end', 'stretch'], 'stretch'),
    }}
  >
    {children}
  </div>
);
