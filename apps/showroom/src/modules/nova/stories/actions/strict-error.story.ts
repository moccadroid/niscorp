import { Demo } from './strict-error.demo';
import source from './strict-error.demo?raw';

export const story = {
  id: 'strict-error',
  name: 'Strict mode error',
  description:
    'A `Nonexistent` component is missing from the registry. In lax mode the renderer emits an error node in place — siblings still render.',
  category: 'Errors',
  kind: 'action' as const,
  Demo,
  source,
};
