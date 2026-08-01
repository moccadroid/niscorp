import { z } from 'zod';

// Semantic prop vocabularies. A layout names a token; the component turns it
// into CSS. Layouts never carry a colour, a class or a pixel that means
// something — only a word from one of these lists.

export const ALIGN: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', baseline: 'baseline' };
export const JUSTIFY: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around' };

export const COLOR: Record<string, string> = {
  ink: 'var(--ink)',
  soft: 'var(--ink-soft)',
  mute: 'var(--ink-mute)',
  faint: 'var(--ink-faint)',
  accent: 'var(--accent)',
  warn: 'var(--warn)',
  alert: 'var(--alert)',
  good: 'var(--good)',
  invert: 'var(--ground)',
};

export const BG: Record<string, string> = {
  ground: 'var(--ground)',
  surface: 'var(--surface)',
  sunk: 'var(--surface-sunk)',
  accent: 'var(--accent)',
  accentSoft: 'var(--accent-soft)',
  warnSoft: 'var(--warn-soft)',
  alertSoft: 'var(--alert-soft)',
  goodSoft: 'var(--good-soft)',
};

export const SIZE: Record<string, string> = { xs: '11.5px', sm: '13px', md: '15px', lg: '18px', xl: '23px', xxl: '32px', display: '42px' };

export const TONE: Record<string, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--surface-sunk)', fg: 'var(--ink-mute)' },
  accent: { bg: 'var(--accent-soft)', fg: 'var(--accent-ink)' },
  good: { bg: 'var(--good-soft)', fg: 'var(--good)' },
  warn: { bg: 'var(--warn-soft)', fg: 'var(--warn)' },
  alert: { bg: 'var(--alert-soft)', fg: 'var(--alert)' },
};

export const LINE = '1px solid var(--line)';

export const border = z.union([z.boolean(), z.enum(['top', 'bottom', 'left', 'right'])]).optional();
export const dim = z.union([z.number(), z.string()]).optional();
