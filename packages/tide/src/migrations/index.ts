import type { Sequence } from '@niscorp/strata';
import { ReflexDraftSchema, ReflexSchema } from '../schemas';

// A host keeps a reflex or a draft with the grammar it was written at, and upgrades it where it reads it. An addition
// rewrites no stored document, but a reader at an older version refuses one that uses it.
export const TIDE_GRAMMAR: Sequence = {
  id: 'nisc.tide',
  documents: { reflex: {}, draft: {} },
  migrations: [
    {
      description: 'A weekly clock may name several weekdays: `on` takes a list of them',
      steps: [],
    },
  ],
};

export const TIDE_SCHEMAS = {
  'nisc.tide/reflex': ReflexSchema,
  'nisc.tide/draft': ReflexDraftSchema,
} as const;
