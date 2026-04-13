// ═══════════════════════════════════════════════════════════
// Default context spec — shared between execute and previewContext
// ═══════════════════════════════════════════════════════════
//
// One function, one behavior. What the model sees is deterministic
// regardless of whether you're running the agent or previewing.

import type { ContextProducer, ContextSpec } from './types';
import { systemProducer } from './producers/system.producer';
import { inputProducer } from './producers/input.producer';
import { toolsProducer } from './producers/tools.producer';
import { historyProducer } from './producers/history.producer';
import { budgetProducer } from './producers/budget.producer';
import { actionContractProducer } from './producers/action-contract.producer';
import { agentsProducer } from './producers/agents.producer';
import { observationsProducer } from './producers/observations.producer';

export const defaultContextSpecFor = (
  mode: 'text' | 'structured' | 'plan',
  instructions: string,
  toolWhitelist?: ReadonlyArray<string>,
): ContextSpec => {
  if (mode === 'plan') {
    return {
      producers: [
        systemProducer(instructions),
        actionContractProducer(),
        toolsProducer(toolWhitelist ? { allowedIds: toolWhitelist } : {}),
        agentsProducer(),
        budgetProducer(),
        historyProducer(),
        observationsProducer(),
        inputProducer(),
      ],
    };
  }
  const hasTools = toolWhitelist !== undefined && toolWhitelist.length > 0;
  const producers: ContextProducer[] = [
    systemProducer(instructions),
    toolsProducer(toolWhitelist ? { allowedIds: toolWhitelist } : {}),
    historyProducer(),
  ];
  if (hasTools) producers.push(observationsProducer());
  producers.push(inputProducer());
  return { producers };
};
