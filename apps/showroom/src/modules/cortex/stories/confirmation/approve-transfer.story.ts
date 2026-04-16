import * as demo from './approve-transfer.demo';
import source from './approve-transfer.demo?raw';

export const story = {
  id: 'confirmation.approve',
  name: 'Transfer (approve)',
  description:
    'A financial agent checks a balance (runs freely) then tries to transfer funds. The transfer requires human confirmation — Cortex pauses and waits. Click Approve to let it through.',
  category: 'Human in the loop',
  kind: 'confirmation' as const,
  ...demo,
  source,
};
