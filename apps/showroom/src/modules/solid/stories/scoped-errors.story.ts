import * as demo from './scoped-errors.demo';
import source from './scoped-errors.demo?raw';

export const story = {
  id: 'scoped-errors',
  name: 'Scoped error observation',
  description:
    'select().onError() fires only for errors at-or-below its path. Each part of the UI handles its own stream errors independently.',
  category: 'Validation',
  kind: 'stream-demo' as const,
  ...demo,
  source,
};
