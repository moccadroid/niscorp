import type { ContextProducer } from '../types';

export const budgetProducer = (): ContextProducer => ({
  id: 'cortex.budget',
  priority: 70,
  build: ({ budget }) => [
    {
      role: 'system',
      content:
        `## Budget\n` +
        `Tokens: ${budget.tokensUsed} used, ${budget.tokensRemaining} remaining\n` +
        `Ticks: ${budget.ticksUsed} used, ${budget.ticksRemaining} remaining`,
      source: 'cortex.budget',
      tags: ['budget'],
    },
  ],
});
