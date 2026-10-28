import { defineTool } from '@niscorp/cortex';
import type { ToolDefinition } from '@niscorp/cortex';
import { z } from 'zod';
import { actions } from '../../app/action-catalog';
import type { Catalog } from './catalog';

// What the model may do before it replies. Most answers need nothing: the reply alone is the fastest answer.

const ids = (catalog: Catalog): [string, ...string[]] => {
  const [first = '', ...rest] = catalog.actions.map((action) => action.id);
  return [first, ...rest];
};

// One of the ACTIONS whole, as nova holds it.
export const readActionTool = (catalog: Catalog): ToolDefinition =>
  defineTool({
    id: 'mira.read-action',
    name: 'read_action',
    riskLevel: 'low',
    description: 'The full nova definition of one of the ACTIONS: its data and its layout. Use it only when the description and input schema in ACTIONS are not enough.',
    input: z.object({ action: z.enum(ids(catalog)).describe('Which of the ACTIONS.') }),
    execute: ({ action }) => {
      const definition = catalog.actions.some((held) => held.id === action) ? actions[action] : undefined;
      if (definition === undefined) return `There is no action "${action}" in ACTIONS.`;
      const { id, title, description, input, data, layout } = definition;
      return { id, title, description, input, data, layout };
    },
  });
