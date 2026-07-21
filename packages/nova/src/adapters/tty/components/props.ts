// ═══════════════════════════════════════════════════════════
// Prop readers + line arithmetic for the TTY kit. The readers mirror the DOM
// kit's (narrow `unknown` with `typeof`, no casts); the line helpers are what
// a terminal has instead of CSS — stack, inline-join, pad, truncate.
// ═══════════════════════════════════════════════════════════

import type { TtyBlock } from '../index';

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

// A handful of icon names → a glyph, so icon-only buttons show something.
const ICON: Record<string, string> = {
  plus: '+', bell: '\u{1F514}', sparkles: '✨', more: '⋯', search: '\u{1F50D}', check: '✓', close: '✕', settings: '⚙',
};
export const iconGlyph = (name: string): string => ICON[name] ?? name;

// Stack child blocks vertically — the terminal's default flow.
export const stack = (children: TtyBlock[]): TtyBlock => ({ lines: children.flatMap((child) => child.lines) });

// Join children on one line when every child IS one line ('a  b  c');
// a multi-line child degrades the row to a stack — columns are not worth
// faking with padding at this altitude.
export const inline = (children: TtyBlock[], separator = '  '): TtyBlock => {
  const flat = children.filter((child) => child.lines.length > 0);
  if (flat.every((child) => child.lines.length === 1)) {
    const line = flat.map((child) => child.lines[0]).join(separator).trim();
    return { lines: line === '' ? [] : [line] };
  }
  return stack(flat);
};

// The inline TEXT of children, for leaves that want a string (Button label).
export const inlineText = (children: TtyBlock[]): string => inline(children, ' ').lines.join(' ').trim();

export const truncate = (text: string, width: number): string =>
  text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`;

export const pad = (text: string, width: number): string => truncate(text, width).padEnd(width);

export const indent = (block: TtyBlock, prefix = '  '): TtyBlock => ({ lines: block.lines.map((line) => `${prefix}${line}`) });
