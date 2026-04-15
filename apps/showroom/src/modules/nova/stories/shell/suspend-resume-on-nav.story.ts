import { Demo } from './suspend-resume-on-nav.demo';
import source from './suspend-resume-on-nav.demo?raw';

export const story = {
  id: 'suspend-resume-on-nav',
  name: 'Suspend / resume on navigation',
  description:
    'All four lifecycle hooks (mount, unmount, suspend, resume) log their own name to an events array. Pushing `inner` suspends `outer`; popping resumes — each round-trip adds two entries.',
  category: 'Lifecycle',
  kind: 'shell' as const,
  Demo,
  source,
};
