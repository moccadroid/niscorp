// ═══════════════════════════════════════════════════════════
// Confirmation flow demo stories
// ═══════════════════════════════════════════════════════════

import type { CortexStory } from '../story-types';
import { financialAgent, checkBalanceTool, transferFundsTool } from '../agents/confirmation-demo';

const approveTransfer: CortexStory = {
  id: 'confirmation.approve',
  name: 'Transfer (approve)',
  description:
    'A financial agent checks a balance (runs freely) then tries to transfer funds. The transfer requires human confirmation — Cortex pauses and waits. Click Approve to let it through.',
  category: 'Human in the loop',
  kind: 'confirmation',
  demo: 'confirmation',
  agent: financialAgent,
  tools: [checkBalanceTool, transferFundsTool],
  prompt: 'Check Alice\'s balance, then transfer $200 from Alice to Bob.',
};

const denyTransfer: CortexStory = {
  id: 'confirmation.deny',
  name: 'Transfer (deny)',
  description:
    'Same agent, same tools. But this time, deny the transfer. The agent sees the denial observation and reports that the operation was not approved. No funds move.',
  category: 'Human in the loop',
  kind: 'confirmation',
  demo: 'confirmation',
  agent: financialAgent,
  tools: [checkBalanceTool, transferFundsTool],
  prompt: 'Transfer $500 from Carol to Bob.',
};

export const confirmationStories: readonly CortexStory[] = [approveTransfer, denyTransfer];
