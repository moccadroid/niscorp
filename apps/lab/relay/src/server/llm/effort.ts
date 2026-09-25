import type { ReasoningEffort } from '@niscorp/signal';

// ═══════════════════════════════════════════════════════════
// Reasoning effort — how hard a model thinks before it answers.
//
// The rungs are the PROVIDER's, not ours, and they differ per model: Groq's
// gpt-oss takes low/medium/high, Groq's Qwen takes none/default/low/medium/high,
// GLM takes high/xhigh. So there is no app-wide scale — each MODELS entry
// publishes the rungs it offers and its own default, and Settings offers exactly
// those. The scale itself is signal's: a rung signal cannot send cannot be
// offered here.
// ═══════════════════════════════════════════════════════════

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
