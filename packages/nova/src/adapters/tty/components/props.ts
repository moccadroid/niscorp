import type { TtyBlock } from '../index';

export { num, str, bool, iconGlyph, type Props } from '../../prop-readers';

export const stack = (children: TtyBlock[]): TtyBlock => ({ lines: children.flatMap((child) => child.lines) });

export const inline = (children: TtyBlock[], separator = '  '): TtyBlock => {
  const flat = children.filter((child) => child.lines.length > 0);
  if (flat.every((child) => child.lines.length === 1)) {
    const line = flat.map((child) => child.lines[0]).join(separator).trim();
    return { lines: line === '' ? [] : [line] };
  }
  return stack(flat);
};

export const inlineText = (children: TtyBlock[]): string => inline(children, ' ').lines.join(' ').trim();

export const truncate = (text: string, width: number): string =>
  text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`;

export const pad = (text: string, width: number): string => truncate(text, width).padEnd(width);

export const indent = (block: TtyBlock, prefix = '  '): TtyBlock => ({ lines: block.lines.map((line) => `${prefix}${line}`) });
