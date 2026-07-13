// ═══════════════════════════════════════════════════════════
// Duration parsing — '30s' / '5m' / '1h' / plain milliseconds
// ═══════════════════════════════════════════════════════════

const DURATION_REGEX = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/;

const UNIT_MS: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };

export const parseDuration = (value: number | string): number => {
  if (typeof value === 'number') return value;
  const match = value.trim().match(DURATION_REGEX);
  const unit = match?.[2] !== undefined ? UNIT_MS[match[2]] : undefined;
  if (!match || match[1] === undefined || unit === undefined) {
    throw new Error(`[cortex:config] Invalid duration "${value}". Use a number of ms or "<n>ms" / "<n>s" / "<n>m" / "<n>h".`);
  }
  return Math.round(Number(match[1]) * unit);
};
