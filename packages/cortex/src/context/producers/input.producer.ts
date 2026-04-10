import type { ContextProducer } from '../types';

// Minified on purpose: this string ships in every system prompt the
// agent ever sees as the user message. Pretty-printing roughly doubles
// the token count for zero benefit. See niscorp/STYLE_GUIDE.md
// §"Never pretty-print JSON inside prompts".
const stringifyInput = (input: unknown): string => {
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
};

export const inputProducer = (): ContextProducer => ({
  id: 'cortex.input',
  priority: 100,
  build: ({ input }) => [
    {
      role: 'user',
      content: stringifyInput(input),
      source: 'cortex.input',
    },
  ],
});
