import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';

export const formInput = z.object({
  title: z.string().describe('The heading on the card.'),
  write: z.string().describe('Which write saving it goes through, by fingerprint.'),
  fields: z.array(z.object({ key: z.string(), label: z.string(), value: z.string() })).describe('The fields, in order: the key the write takes it under, its label, and what is in it.'),
});

// The model may fill it in; only the person saves it. Saved, it says so on the message `saved`, and the server takes
// it off an answer that opened it.
export const formAction: ActionDefinition = {
  id: 'rows.form',
  title: 'Form',
  description: 'A form the person fills in and saves, to add a record.',
  data: { title: '', write: '', fields: [], saving: false, saved: false, error: '' },
  input: z.toJSONSchema(formInput),
  layout: {
    component: 'Card',
    props: { title: '{{$.title}}' },
    children: [
      { for: '$.fields', as: 'field', key: 'key', do: { component: 'Field', props: { label: '$field.label' }, children: [{ component: 'Input', model: '$field.value' }] } },
      {
        component: 'Row',
        children: [
          { component: 'Button', ref: 'save', props: { label: { $if: '$.saving', $then: 'Saving…', $else: 'Save' } } },
          { if: '$.saved', then: { component: 'Text', props: { tone: 'muted' }, children: 'Saved.' } },
        ],
      },
      { if: '$.error', then: { component: 'Text', props: { tone: 'error' }, children: '{{$.error}}' } },
    ],
  },
  endpoints: { save: { fn: 'answers.write' } },
  triggers: [
    {
      event: 'ui:click',
      ref: 'save',
      do: [
        { set: 'saving', value: true },
        { set: 'saved', value: false },
        { set: 'error', value: '' },
        {
          call: 'save',
          onSuccess: [{ set: 'saving', value: false }, { set: 'saved', value: true }, { reset: 'fields' }, { emit: { channel: 'saved', payload: '$.write' } }],
          onError: [{ set: 'saving', value: false }, { set: 'error', value: '{{@error.message}}' }],
        },
      ],
    },
  ],
};
