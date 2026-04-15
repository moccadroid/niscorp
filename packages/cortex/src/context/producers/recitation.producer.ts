// ═══════════════════════════════════════════════════════════
// recitationProducer — re-inject goals to fight context drift
// ═══════════════════════════════════════════════════════════
//
// In long workflows the model loses sight of its original
// objective ("lost in the middle"). This producer injects a
// short recap of the active goal at medium-high priority,
// keeping it in the model's recent attention window.

import type { ContextProducer } from '../types';

export type RecitationProducerOptions = {
  goal: string;
  priority?: number;
};

export const recitationProducer = (options: RecitationProducerOptions): ContextProducer => ({
  id: 'cortex.recitation',
  priority: options.priority ?? 60,
  build: () => [
    {
      role: 'system',
      content: `## Current goal\n${options.goal}`,
      source: 'cortex.recitation',
      tags: ['recitation', 'goal'],
    },
  ],
});
