import { defineTool } from '@niscorp/cortex';
import type { ToolDefinition } from '@niscorp/cortex';
import { z } from 'zod';
import { actions } from '../../app/action-catalog';
import type { Catalog } from './catalog';
import { ScreenSchema } from './reply.schema';
import type { Screen } from './reply.schema';

// What the model may do before it replies. Most answers need neither: the reply alone is the fastest answer.

// One of the ACTIONS whole, as nova holds it.
export const readActionTool = (catalog: Catalog): ToolDefinition =>
  defineTool({
    id: 'mira.read-action',
    name: 'read_action',
    riskLevel: 'low',
    description: 'One of the ACTIONS whole, as nova holds it: its data — what it shows — and its layout — how it shows it. ACTIONS says enough to open any of them; read one only when you need to know more.',
    input: z.object({ action: z.string().describe('The id of one of the ACTIONS.') }),
    execute: ({ action }) => {
      const definition = catalog.actions.some((held) => held.id === action) ? actions[action] : undefined;
      if (definition === undefined) return `There is no action "${action}" in ACTIONS.`;
      const { id, title, description, input, data, layout } = definition;
      return { id, title, description, input, data, layout };
    },
  });

// Cards on the screen while the model is still at work: what a long answer shows before it ends.
export const placeTool = (place: (screen: Screen) => string): ToolDefinition =>
  defineTool({
    id: 'mira.place',
    name: 'place',
    riskLevel: 'low',
    description:
      "Puts cards on your person's screen now, while you are still at work on the answer: the screen after them, every card on it in reading order, as your reply's cards are. Your reply's cards, when you finish, are the screen after the answer, keeping cards from the screen as you placed it; with none, the screen stays as you placed it.",
    input: ScreenSchema,
    execute: (screen) => place(screen),
  });
