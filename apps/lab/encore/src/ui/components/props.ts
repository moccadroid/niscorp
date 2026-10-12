export type Props = Record<string, unknown>;

export type Row = Record<string, unknown>;

export const isRow = (value: unknown): value is Row => value !== null && typeof value === 'object' && !Array.isArray(value);

export const text = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

export const num = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return fallback;
};

export const rowsOf = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRow) : []);

export const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => allowed.find((option) => option === value) ?? fallback;

export const length = (value: unknown): string | undefined => {
  if (typeof value === 'number') return `${value}px`;
  if (typeof value === 'string' && value !== '') return value;
  return undefined;
};

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const HUES = ['teal', 'violet', 'blue', 'lime', 'pink'] as const;

export const TONES = ['plain', 'mute', 'accent', 'warn', 'alert', 'good'] as const;
export type Tone = (typeof TONES)[number];

export const classes = (...names: (string | false | undefined)[]): string => names.filter((name) => typeof name === 'string' && name !== '').join(' ');
