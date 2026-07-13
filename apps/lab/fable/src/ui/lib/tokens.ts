import { z } from 'zod';

// Shared style tokens — the primitives read these (the values are CSS custom
// properties defined in theme.css) — plus a couple of zod helpers reused
// across the primitive prop schemas. No React here; pure maps.

export const TEXT_COLOR: Record<string, string> = {
  default: 'var(--text)',
  secondary: 'var(--text-2)',
  dim: 'var(--text-dim)',
  mute: 'var(--text-mute)',
  accent: 'var(--accent-hover)',
  red: 'var(--red)',
  green: 'var(--green)',
};

export const LINE = '1px solid var(--border)';

export const ALIGN: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

export const JUSTIFY: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
};

export const FS: Record<string, string> = {
  xs: 'var(--fs-xs)',
  sm: 'var(--fs-sm)',
  md: 'var(--fs-md)',
  lg: 'var(--fs-lg)',
  xl: 'var(--fs-xl)',
  '2xl': 'var(--fs-2xl)',
};

// `dim` — a number (px) or a string (any CSS length).
export const dim = z.union([z.number(), z.string()]).optional();

// `border` — true (all sides) or a single side. One prop instead of four.
export const border = z
  .union([z.boolean(), z.enum(['top', 'bottom', 'left', 'right'])])
  .optional();
