import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { HUES, classes, length, num, oneOf } from './props';
import type { Props } from './props';

// Arrangement primitives. They know about boxes, gaps and columns, and have
// never heard of a stage.

const BOX_TONES = ['plain', 'ground', 'panel', 'sunken', 'calm', 'elevated', 'critical', 'marker'] as const;

// `tone` doubles as the frame's alarm state: calm / elevated / critical are
// box tones like any other, so the intent line changing colour when a storm is
// typed is a data binding, not a feature of this component.
// `stick` pins a box to the top or the bottom of the PAGE as it scrolls — the
// page, because the room has exactly one scrollbar and it is the document's.
// `scroll` exists for an instrument drawer and nothing in the app uses it.
export const Box: NovaComponent<Props> = ({ children, tone, pad, px, py, h, minH, maxH, grow, scroll, stick }) => {
  const style: CSSProperties = {
    padding: length(pad),
    paddingInline: length(px),
    paddingBlock: length(py),
    height: length(h),
    minHeight: length(minH),
    maxHeight: length(maxH),
    flex: grow === true ? '1 1 0' : undefined,

    overflow: scroll === true ? 'auto' : undefined,
  };
  return (
    <div className={classes('en-box', `en-box--${oneOf(tone, BOX_TONES, 'plain')}`, stick === 'top' && 'en-box--stick-top', stick === 'bottom' && 'en-box--stick-bottom')} style={style}>
      {children}
    </div>
  );
};

// `grow` is a flex weight (true = 1) and `basis` the width it would like before
// growing, `max` the width past which it stops — together they make a Stack a
// COLUMN of a wrapping Row. A Stack with
// nothing in it is removed from the flow by the stylesheet (`:empty`), so a
// column whose every slot rendered nothing leaves no gap behind.
export const Stack: NovaComponent<Props> = ({ children, gap, pad, h, minH, grow, basis, max }) => {
  const weight = grow === true ? 1 : num(grow, 0);
  return (
    <div className="en-stack" style={{ gap: num(gap, 12), padding: length(pad), height: length(h), minHeight: length(minH), maxWidth: length(max), flex: weight > 0 ? `${weight} 1 ${length(basis) ?? '0'}` : undefined }}>
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

// ONE PACKED FLOW. Every card in the room is a `Tile` inside one `Pack`, however
// many canvases they came from (a slot renders no element of its own, so tiles
// from six canvases are siblings here). The grid has as many columns as the
// width affords — the stylesheet decides, by container query — a tile spans what
// its size class says, and `dense` lets a later small card fill a hole an
// earlier wide one left.
//
// ...AND PACKED DOWNWARD TOO. Grid rows are as tall as their tallest card, which
// leaves a band of nothing under every short one. So rows here are 4 px, and a
// tile spans as many of them as its content is tall — measured, and re-measured
// when the content resizes. That is the whole of "masonry"; nothing is absolutely
// positioned and the browser still does the packing.
const PACK_ROW = 4;
const PACK_GAP = 12;

export const Pack: NovaComponent<Props> = ({ children }) => {
  const grid = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = grid.current;
    if (element === null) return undefined;
    const fit = (): void => {
      for (const tile of element.querySelectorAll<HTMLElement>(':scope > .en-tile')) {
        const body = tile.firstElementChild;
        if (body === null) continue;
        tile.style.gridRowEnd = `span ${Math.max(1, Math.ceil((body.getBoundingClientRect().height + PACK_GAP) / PACK_ROW))}`;
      }
    };
    const sizes = new ResizeObserver(fit);
    const watch = (): void => {
      sizes.disconnect();
      sizes.observe(element);
      for (const tile of element.querySelectorAll<HTMLElement>(':scope > .en-tile')) if (tile.firstElementChild !== null) sizes.observe(tile.firstElementChild);
      fit();
    };
    const arrivals = new MutationObserver(watch);
    arrivals.observe(element, { childList: true });
    watch();
    return () => {
      sizes.disconnect();
      arrivals.disconnect();
    };
  }, []);
  return (
    <div className="en-pack">
      <div className="en-pack__grid" ref={grid}>
        {children}
      </div>
    </div>
  );
};

// One card's place in the pack: how wide it is allowed to be, and which of the
// kit's hues edges it. `pin` keeps it ahead of everything that is not pinned.
export const Tile: NovaComponent<Props> = ({ children, span, accent, pin }) => (
  <div className={classes('en-tile', `en-tile--${oneOf(span, ['wide', 'regular', 'compact'], 'regular')}`, `en-hue--${oneOf(accent, HUES, 'teal')}`, pin === true && 'en-tile--pin')}>
    <div className="en-tile__body">{children}</div>
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
