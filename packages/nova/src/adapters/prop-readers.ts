import { ownEntry } from '../shared/common';

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

const ICON: Record<string, string> = {
  plus: '+', bell: '\u{1F514}', sparkles: '✨', more: '⋯', search: '\u{1F50D}', check: '✓', close: '✕', settings: '⚙',
};
export const iconGlyph = (name: string): string => ownEntry(ICON, name) ?? name;
