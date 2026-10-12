import type { ResponseWireStrategy } from './index';

// OpenAI's 4o models sometimes answer with one JSON object per line where one value was
// asked for. Last line first: the final line is usually the answer.
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
