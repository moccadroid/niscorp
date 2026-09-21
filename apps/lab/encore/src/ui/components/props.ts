// Reading layout props. A primitive is handed `Record<string, unknown>` — the
// tree was authored as JSON, possibly by something that is not a person — so
// every prop is NARROWED here rather than asserted. A wrong type renders as the
// fallback, never as a crash in the middle of somebody's ops room.

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

// A CSS length from a layout prop: numbers are pixels, strings pass through
// ('100%', '100vh', '1fr 2fr').
export const length = (value: unknown): string | undefined => {
  if (typeof value === 'number') return `${value}px`;
  if (typeof value === 'string' && value !== '') return value;
  return undefined;
};

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const TONES = ['plain', 'mute', 'accent', 'warn', 'alert', 'good'] as const;
export type Tone = (typeof TONES)[number];

export const classes = (...names: (string | false | undefined)[]): string => names.filter((name) => typeof name === 'string' && name !== '').join(' ');
