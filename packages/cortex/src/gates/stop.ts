// ═══════════════════════════════════════════════════════════
// Built-in stop conditions
// ═══════════════════════════════════════════════════════════
//
// One bound vocabulary: stopWhen: [stepCount(20), tokens(100_000),
// duration('5m'), outputRetries(3)]. Applied defaults (when an agent
// omits stopWhen entirely): stepCount(20), outputRetries(3). No
// default duration or token cap — a default every call site
// overrides is a wrong default.

import { parseDuration } from '../utils/duration';
import type { RunProgress, StopCondition, StopVerdict } from './types';

export const stepCount = (max: number): StopCondition =>
  (progress: RunProgress): StopVerdict =>
    progress.steps >= max ? { stop: 'steps', message: `step limit reached (${max})` } : null;

export const tokens = (max: number): StopCondition =>
  (progress: RunProgress): StopVerdict =>
    progress.usage.totalTokens >= max
      ? { stop: 'tokens', message: `token budget reached (${progress.usage.totalTokens}/${max})` }
      : null;

export const duration = (value: number | string): StopCondition => {
  const maxMs = parseDuration(value);
  return (progress: RunProgress): StopVerdict =>
    progress.elapsedMs >= maxMs ? { stop: 'duration', message: `duration limit reached (${maxMs}ms)` } : null;
};

export const outputRetries = (max: number): StopCondition =>
  (progress: RunProgress): StopVerdict =>
    progress.outputRetries >= max
      ? { stop: 'output_retries', message: `output retries exhausted (${max})` }
      : null;

export const DEFAULT_STOP_CONDITIONS: ReadonlyArray<StopCondition> = [stepCount(20), outputRetries(3)];

export const checkStop = (
  conditions: ReadonlyArray<StopCondition>,
  progress: RunProgress,
): StopVerdict => {
  for (const condition of conditions) {
    const verdict = condition(progress);
    if (verdict) return verdict;
  }
  return null;
};
