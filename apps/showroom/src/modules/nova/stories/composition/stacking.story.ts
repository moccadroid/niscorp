import * as demo from './stacking.demo';
import source from './stacking.demo?raw';

export const story = {
  id: 'compose-stacking',
  name: 'Stacking fragments',
  description:
    '`with` takes a list. Fragments fold in array order, each wrapping the result so far, so the LAST listed ends up OUTERMOST. `with: [\'inner\', \'outer\']` nests outer ▸ inner ▸ action. Lets orthogonal concerns compose — e.g. an auth gate around a modal around a form.',
  category: 'Composition',
  kind: 'action' as const,
  ...demo,
  source,
};
