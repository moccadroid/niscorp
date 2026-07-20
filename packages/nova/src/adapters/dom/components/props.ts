// ═══════════════════════════════════════════════════════════
// Reading nova's presentational prop vocabulary into inline styles. These are
// LAYOUT props (gap, justify, padding, size, weight) — universal, not domain
// nouns — so a reference kit can honor them and real structure renders. The
// readers narrow `unknown` with `typeof`; there are no casts.
// ═══════════════════════════════════════════════════════════

export type Props = Record<string, unknown>;

export const num = (props: Props, key: string): number | undefined => {
  const value = props[key];
  return typeof value === 'number' ? value : undefined;
};

export const str = (props: Props, key: string): string | undefined => {
  const value = props[key];
  return typeof value === 'string' ? value : undefined;
};

export const bool = (props: Props, key: string): boolean => props[key] === true;

// A CSS dimension: a number is pixels, a string passes through ('100%', '100vh').
export const dim = (value: unknown): string | undefined =>
  typeof value === 'number' ? `${value}px` : typeof value === 'string' ? value : undefined;

const px = (value: number | undefined): string | undefined => (value === undefined ? undefined : `${value}px`);

const JUSTIFY: Record<string, string> = {
  start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around', stretch: 'stretch',
};
const ALIGN: Record<string, string> = {
  start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', baseline: 'baseline',
};
const SIZE: Record<string, string> = { xs: '12px', sm: '13px', md: '14px', lg: '16px', xl: '20px', '2xl': '24px' };
const WEIGHT: Record<string, string> = { normal: '400', medium: '500', semibold: '600', bold: '700' };
const COLOR: Record<string, string> = {
  mute: 'var(--dom-mute)', muted: 'var(--dom-mute)', dim: 'var(--dom-mute)', secondary: '#4b5563', accent: 'var(--dom-accent)',
};
const BG: Record<string, string> = { surface: '#fbfcfd', canvas: '#ffffff', dim: '#f4f5f7', mute: '#f4f5f7' };

// A style record for any element: setProperty skips undefined, so absent props
// leave the browser default.
export const css = (el: HTMLElement, style: Record<string, string | undefined>): void => {
  for (const [key, value] of Object.entries(style)) if (value !== undefined) el.style.setProperty(key, value);
};

// Box/spacing props shared by every container.
export const boxStyle = (props: Props): Record<string, string | undefined> => {
  const p = num(props, 'p') ?? num(props, 'padding');
  const border = props['border'];
  const bg = str(props, 'bg') ?? str(props, 'background');
  return {
    width: dim(props['w']) ?? dim(props['width']),
    height: dim(props['h']) ?? dim(props['height']),
    padding: px(p),
    'padding-left': px(num(props, 'px')),
    'padding-right': px(num(props, 'px')),
    'padding-top': px(num(props, 'py')),
    'padding-bottom': px(num(props, 'py')),
    'flex-grow': bool(props, 'grow') ? '1' : undefined,
    background: bg === undefined ? undefined : BG[bg] ?? bg,
    'border-radius': px(num(props, 'radius')),
    border: border === true ? '1px solid var(--dom-line)' : undefined,
    [`border-${typeof border === 'string' ? border : 'x'}`]: typeof border === 'string' ? '1px solid var(--dom-line)' : undefined,
  };
};

// Flex layout props (Row/Stack).
export const flexStyle = (props: Props, direction: 'row' | 'column'): Record<string, string | undefined> => ({
  display: 'flex',
  'flex-direction': direction,
  gap: px(num(props, 'gap')),
  'align-items': ALIGN[str(props, 'align') ?? ''],
  'justify-content': JUSTIFY[str(props, 'justify') ?? ''],
  'flex-wrap': bool(props, 'wrap') ? 'wrap' : undefined,
});

// Grid props — `columns` (N equal tracks) or `weights` ([2,1,1] → fr tracks).
// Relay's tables and tile rows are grids, not stacks; honoring this is what
// makes rows lay out horizontally instead of collapsing to a column.
export const gridStyle = (props: Props): Record<string, string | undefined> => {
  const columns = num(props, 'columns');
  const weights = props['weights'];
  const template = Array.isArray(weights)
    ? weights.map((w) => (typeof w === 'number' ? `${w}fr` : '1fr')).join(' ')
    : columns !== undefined
      ? `repeat(${columns}, 1fr)`
      : undefined;
  return {
    display: 'grid',
    'grid-template-columns': template,
    gap: px(num(props, 'gap')),
    'align-items': ALIGN[str(props, 'align') ?? ''],
  };
};

// Typography props (Text).
export const textStyle = (props: Props): Record<string, string | undefined> => {
  const size = str(props, 'size');
  const weightNum = num(props, 'weight');
  const color = str(props, 'color');
  return {
    'font-size': size === undefined ? undefined : SIZE[size] ?? size,
    'font-weight': weightNum !== undefined ? String(weightNum) : WEIGHT[str(props, 'weight') ?? ''],
    color: color === undefined ? undefined : COLOR[color] ?? color,
    'text-transform': bool(props, 'upper') ? 'uppercase' : undefined,
    'letter-spacing': bool(props, 'upper') ? '0.04em' : undefined,
  };
};

// A handful of icon names → a glyph, so icon-only buttons show something.
const ICON: Record<string, string> = {
  plus: '+', bell: '\u{1F514}', sparkles: '✨', more: '⋯', search: '\u{1F50D}', check: '✓', close: '✕', settings: '⚙',
};
export const iconGlyph = (name: string): string => ICON[name] ?? name;
