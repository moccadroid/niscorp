// ═══════════════════════════════════════════════════════════
// Run history — localStorage-backed memory of demo runs
// ═══════════════════════════════════════════════════════════
//
// Cortex demos can't be statically validated — they require a real
// LLM call. To give the sidebar a "have I confirmed this works?"
// signal we persist the outcome of every run keyed by story id.
// Subsequent reloads read the history and color the sidebar dots
// accordingly:
//   - never run     → grey
//   - last passed   → green
//   - last failed   → red
//
// "Pass" / "fail" semantics depend on the demo:
//   - structured-extract / prism-mapping / plan-mode → result.ok
//   - tool-use happy path                            → result.ok
//   - tool-use policy-denial demo                    → denied as expected

const STORAGE_KEY = 'showroom-cortex-run-history';

export type RunOutcome = 'pass' | 'fail';

type StoredHistory = Record<string, RunOutcome>;

const isStoredHistory = (value: unknown): value is StoredHistory => {
  if (value === null || typeof value !== 'object') return false;
  for (const key of Object.keys(value)) {
    const v = Reflect.get(value, key);
    if (v !== 'pass' && v !== 'fail') return false;
  }
  return true;
};

export const loadHistory = (): StoredHistory => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredHistory(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
};

const writeHistory = (history: StoredHistory): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
};

export const recordRun = (storyId: string, outcome: RunOutcome): void => {
  const history = loadHistory();
  history[storyId] = outcome;
  writeHistory(history);
  // Notify any listeners (the sidebar evaluators) that history changed.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cortex:run-history-changed'));
  }
};

export const getOutcome = (storyId: string): RunOutcome | undefined => {
  const history = loadHistory();
  return history[storyId];
};

export const clearHistory = (): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('cortex:run-history-changed'));
};
