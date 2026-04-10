import type { DotColor, StatusMap } from '../../types';
import { loadHistory } from '../run-history';

// ═══════════════════════════════════════════════════════════
// Evaluators — sidebar status dots
// ═══════════════════════════════════════════════════════════
//
// Cortex stories require a real LLM call to evaluate, so they
// cannot be statically validated like prism stories. Instead we
// read run history from localStorage (populated by the runners
// after each run completes) and color dots accordingly:
//   never run    → grey
//   last passed  → green
//   last failed  → red
//
// The runners dispatch a 'cortex:run-history-changed' event after
// recording a result. The chrome can listen for it to re-render
// dots; the simplest path is a full re-evaluate on the event,
// which is cheap because evaluateAll is just a localStorage read.

export const evaluateAll = async (stories: readonly unknown[]): Promise<StatusMap> => {
  const history = loadHistory();
  const map: StatusMap = {};
  for (const story of stories) {
    if (story === null || typeof story !== 'object') continue;
    const id = Reflect.get(story, 'id');
    if (typeof id !== 'string') continue;
    const outcome = history[id];
    let dot: DotColor = 'gray';
    if (outcome === 'pass') dot = 'green';
    if (outcome === 'fail') dot = 'red';
    map[id] = dot;
  }
  return map;
};
