import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';

// The model may fill it in; only the person saves it.
export const formAction: ActionDefinition = {
  id: 'rows.form',
  title: 'Form',
  description: 'A form that writes one row through a write the app ships, its fields filled in from the message where it said what goes in them.',
  data: { title: '', write: '', fields: [], saving: false, saved: false, error: '' },
  input: z.toJSONSchema(
    z.object({
      title: z.string().describe('What the form does, in a few words.'),
      write: z.string().describe('The fingerprint of the write it saves through.'),
      fields: z.array(z.object({ key: z.string(), label: z.string(), value: z.string() })).describe('The fields, in order: what the write is sent as, the label, and what is in it.'),
    }),
  ),
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
        { call: 'save', onSuccess: [{ set: 'saving', value: false }, { set: 'saved', value: true }], onError: [{ set: 'saving', value: false }, { set: 'error', value: '{{@error.message}}' }] },
      ],
    },
  ],
};
