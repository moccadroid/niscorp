import * as demo from './db-compound.demo';
import source from './db-compound.demo?raw';

export const story = {
  id: 'rules.compound-condition',
  name: 'Compound condition ($and)',
  description:
    'A rule with $and composition: it fires ONLY when 2+ DB queries have been made AND the latest result is an enterprise-tier customer. Demonstrates that rules go beyond simple counters — conditions compose with full Prism-style operators.',
  category: 'Condition composition',
  kind: 'rules' as const,
  ...demo,
  source,
};
