// ═══════════════════════════════════════════════════════════
// Reasoning effort — how hard a model thinks before it answers.
//
// The rungs are the PROVIDER's, not ours, and they differ per model: Groq's
// gpt-oss takes low/medium/high, GLM takes high/xhigh, Ox Alpha takes
// low/high/max. So there is no app-wide scale — each MODELS entry publishes the
// rungs it actually accepts (verified against the live APIs) and its own
// default, and Settings offers exactly those.
// ═══════════════════════════════════════════════════════════

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  minimal: 'Minimal',
  low: 'Low — fastest',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max — slowest',
};
