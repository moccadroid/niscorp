import { z } from 'zod';

export const TEXT_COLOR: Record<string, string> = {
  default: 'var(--text)',
  secondary: 'var(--text-2)',
  dim: 'var(--text-dim)',
  mute: 'var(--text-mute)',
  accent: 'var(--accent-hover)',
  red: 'var(--red)',
  green: 'var(--green)',
};

export const BG: Record<string, string> = {
  transparent: 'transparent',
  sunken: 'var(--bg-sunken)',
  surface: 'var(--surface)',
  'surface-2': 'var(--surface-2)',
  hover: 'var(--hover)',
  accent: 'var(--accent)',
  brand: 'linear-gradient(135deg, var(--accent), #b06cff)',
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

// A number is px; a string is any CSS length.
export const dim = z.union([z.number(), z.string()]).optional();

export const border = z
  .union([z.boolean(), z.enum(['top', 'bottom', 'left', 'right'])])
  .optional();
