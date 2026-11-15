import type { Sequence } from '@niscorp/strata';
import { ActionDefinitionSchema, ActionFragmentSchema } from '../action/schemas';
import { LayoutNodeSchema } from '../layout/schemas';

const actionEmbeds = {
  layout: 'nisc.nova/layout',
  'endpoints.*.request': 'nisc.prism/config',
  'endpoints.*.response': 'nisc.prism/config',
} as const;

export const NOVA_SEQUENCE: Sequence = {
  id: 'nisc.nova',
  documents: {
    action: { embeds: actionEmbeds },
    fragment: { embeds: actionEmbeds },
    layout: {
      embeds: {
        children: 'nisc.nova/layout',
        'children[]': 'nisc.nova/layout',
        then: 'nisc.nova/layout',
        else: 'nisc.nova/layout',
        do: 'nisc.nova/layout',
      },
    },
  },
  migrations: [
    {
      // No steps: an addition rewrites no stored action, but a reader at 0 must
      // refuse an action that uses it.
      description: 'The `reconcile` step: make a canvas hold exactly the actions a list in the action\'s data names',
      steps: [],
    },
    {
      description: 'The endpoint `timeoutMs`: how long to wait for the reply before the call fails',
      steps: [],
    },
  ],
};

export const NOVA_SCHEMAS = {
  'nisc.nova/action': ActionDefinitionSchema,
  'nisc.nova/fragment': ActionFragmentSchema,
  'nisc.nova/layout': LayoutNodeSchema,
} as const;
