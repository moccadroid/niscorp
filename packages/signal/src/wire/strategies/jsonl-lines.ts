import type { ResponseWireStrategy } from './index';

// 4o-era OpenAI models occasionally emit one JSON object per line
// (JSONL) where one value was asked for. Contribute each JSON-looking
// line as a candidate, last line first — the final line is usually the
// final answer. The acceptance gate decides; on providers that never
// do this the strategy simply never wins.

export const jsonlLines: ResponseWireStrategy = {
  id: 'jsonl-lines',
  hook: 'response',
  candidates: (content) => {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('{') || line.startsWith('['));
    return lines.length > 1 ? lines.reverse() : [];
  },
};
