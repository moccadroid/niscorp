import type { ReasoningEffort } from '@niscorp/signal';

export type { ReasoningEffort };

export const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: 'None — no reasoning',
  default: "Default — the model's own",
  minimal: 'Minimal',
  low: 'Low — fastest',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max — slowest',
};
