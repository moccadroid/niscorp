import type { Sequence } from '@niscorp/strata';
import { ConfigSchema } from '../schemas/config.schema';

export const PRISM_SEQUENCE: Sequence = {
  id: 'nisc.prism',
  documents: { config: {} },
  migrations: [
    {
      // A marker without steps: no stored config needs rewriting, but a reader
      // one version behind must refuse a config that uses the additions.
      description:
        'Transform ops ($has, $renameKeys, $update, $assert, $walk); $ref "$" for the whole source; $join parts may be any node ' +
        'that evaluates to an array; an op name is not a template key',
      steps: [],
    },
    {
      description:
        'A template key never starts with "$": a `$` name that is not an op is refused by the schema, where it was refused only once evaluated',
      steps: [],
    },
    {
      description:
        '$mod and $toNumber; $round takes a mode (nearest, floor, ceil); $replace takes all; ' +
        'a $ref path is keys and indexes only: any other JSONPath form is refused, where it was read as "$"',
      steps: [],
    },
  ],
};

// Read by the grammar check, which snapshots it and fails when it changes
// without a migration here.
export const PRISM_SCHEMAS = { 'nisc.prism/config': ConfigSchema } as const;
