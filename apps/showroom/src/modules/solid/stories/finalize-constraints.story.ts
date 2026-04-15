import * as demo from './finalize-constraints.demo';
import source from './finalize-constraints.demo?raw';

export const story = {
  id: 'finalize-constraints',
  name: 'Finalize-phase constraints',
  description:
    'Opt in to constraint validation at field-finalize time — catches .min, .max, .regex, .refine without tripping on mid-stream partial strings.',
  category: 'Validation',
  kind: 'stream-demo' as const,
  ...demo,
  source,
};
