import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { checklistLayout } from './checklist.layout';

// A tick moves a step from one list to the other, so each press is a push and a removal, and no step needs an id.
export const checklistAction: ActionDefinition = {
  id: 'guide.checklist',
  title: 'Checklist',
  description: 'A checklist a person ticks off and adds steps to: the steps to do, in order, and the ones done.',
  data: { title: '', todo: [], done: [], adding: '' },
  input: z.toJSONSchema(
    z.object({
      title: z.string().describe('What the steps are for, in a few words.'),
      todo: z.array(z.string()).min(1).describe('The steps still to do, in order, each a few words.'),
      done: z.array(z.string()).nullish().describe('The steps already done.'),
    }),
  ),
  layout: checklistLayout,
  triggers: [
    { event: 'ui:click', ref: 'tick', do: [{ push: 'done', value: { $at: ['$.todo', '@event.payload'] } }, { removeAt: 'todo', index: '{{@event.payload}}' }] },
    { event: 'ui:click', ref: 'untick', do: [{ push: 'todo', value: { $at: ['$.done', '@event.payload'] } }, { removeAt: 'done', index: '{{@event.payload}}' }] },
    { event: 'ui:click', ref: 'add', do: [{ push: 'todo', value: '$.adding' }, { set: 'adding', value: '' }] },
  ],
};
