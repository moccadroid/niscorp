import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { HUES, classes, length, num, oneOf } from './props';
import type { Props } from './props';

const BOX_TONES = ['plain', 'ground', 'panel', 'sunken', 'calm', 'elevated', 'critical', 'dock', 'dock-head'] as const;

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
  const element = useRef<HTMLDivElement>(null);
  // A box stuck to the bottom changes height under the reader, and the page must not
  // move: where it was is remembered from its own scroll events and put back after
  // the resize. A scroll the resize itself caused is not remembered.
  useLayoutEffect(() => {
    const box = element.current;
    if (stick !== 'bottom' || box === null) return undefined;
    let restingAt = window.scrollY;
    let isSettling = false;
    const onScroll = (): void => {
      if (!isSettling) restingAt = window.scrollY;
    };
    const sizes = new ResizeObserver(() => {
      isSettling = true;
      const putBack = (): void => window.scrollTo({ top: Math.min(restingAt, document.documentElement.scrollHeight - window.innerHeight), behavior: 'instant' });
      putBack();
      requestAnimationFrame(() => {
        putBack();
        requestAnimationFrame(() => {
          isSettling = false;
        });
      });
    });
    sizes.observe(box);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      sizes.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [stick]);
  return (
    <div ref={element} className={classes('en-box', `en-box--${oneOf(tone, BOX_TONES, 'plain')}`, stick === 'top' && 'en-box--stick-top', stick === 'bottom' && 'en-box--stick-bottom')} style={style}>
      {children}
    </div>
  );
};

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

// Grid rows are as tall as their tallest card. So rows here are 4 px, and a tile spans as
// many of them as its content is tall, measured and re-measured when the content resizes.
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

export const Tile: NovaComponent<Props> = ({ children, span, accent, pin }) => (
  <div className={classes('en-tile', `en-tile--${oneOf(span, ['wide', 'regular', 'compact'], 'regular')}`, `en-hue--${oneOf(accent, HUES, 'teal')}`, pin === true && 'en-tile--pin')}>
    <div className="en-tile__body">{children}</div>
  </div>
);

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
