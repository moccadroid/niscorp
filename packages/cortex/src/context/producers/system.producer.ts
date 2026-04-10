import type { ContextProducer } from '../types';

export const systemProducer = (prompt: string): ContextProducer => ({
  id: 'cortex.system',
  priority: 100,
  build: () => [
    {
      role: 'system',
      content: prompt,
      source: 'cortex.system',
    },
  ],
});
