import * as demo from './deny-transfer.demo';
import source from './deny-transfer.demo?raw';

export const story = {
  id: 'confirmation.deny',
  name: 'Transfer (deny)',
  description:
    'Same agent, same tools. But this time, deny the transfer. The agent sees the denial observation and reports that the operation was not approved. No funds move.',
  category: 'Human in the loop',
  kind: 'confirmation' as const,
  ...demo,
  source,
};
