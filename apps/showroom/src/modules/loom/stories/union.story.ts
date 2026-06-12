import * as demo from './union.demo';
import source from './union.demo?raw';

export const story = {
  id: 'union',
  name: 'Union',
  description:
    'A discriminated union. Pick the variant from the `kind` selector and only that branch renders; switching reshapes the document to the new branch. Compiles to a select plus per-variant `$eq` conditionals — see the Definition tab.',
  category: 'Structure',
  kind: 'structure' as const,
  ...demo,
  source,
};
