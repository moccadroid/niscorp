import * as demo from './flatten-contact.demo';
import source from './flatten-contact.demo?raw';

export const story = {
  id: 'standalone.prism-mapping.flatten-contact',
  name: 'Flatten nested contact',
  description:
    'A nested contact record with address.* fields. The mapping must flatten and rename. Tests the agent on nested $ref paths.',
  category: 'Structured output (Prism mapping)',
  kind: 'standalone' as const,
  ...demo,
  source,
};
