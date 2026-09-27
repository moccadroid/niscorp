import type { LayoutNode } from '@niscorp/nova';

// A line to ask with, and one of five below it, in this order: what went wrong;
// the wait; what was saved; the document to read, with Save; or — before
// anything was asked — what to try.
export const assistantLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick', 'field', 'go', 'out'], rows: ['auto', 'auto', 'auto', 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'signal' }, children: [{ component: 'Label', children: 'Assistant · ask for an automation' }] },
    { component: 'Field', ref: 'draft', model: '$.draft', props: { area: 'field', value: '$.draft', placeholder: 'End the talk in 30 minutes' } },
    { component: 'Action', ref: 'ask', props: { area: 'go', ink: 'alert', label: 'Ask →' } },
    {
      if: '$.error',
      then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] },
      else: {
        if: '$.proposing',
        then: { component: 'Cell', props: { area: 'out', mark: 'hatch' }, children: [{ component: 'Text', children: 'Writing it…' }] },
        else: {
          if: '$.saved',
          then: {
            component: 'Cell',
            props: { area: 'out', ink: 'live' },
            children: [
              { component: 'Label', children: 'Saved · fires at {{$.proposal.dueLocal}}' },
              { component: 'Text', children: '{{$.proposal.intent}} Tide runs it now — no model is asked again.' },
            ],
          },
          else: {
            if: '$.proposed',
            then: {
              component: 'Cell',
              props: { area: 'out', pad: 'none' },
              children: [
                {
                  component: 'Sheet',
                  props: { areas: ['what', 'doc', 'save'], rows: ['auto', 'auto', 'auto'] },
                  children: [
                    {
                      component: 'Cell',
                      props: { area: 'what', ink: 'highlight' },
                      children: [{ component: 'Label', children: 'Read it first · fires at {{$.proposal.dueLocal}}' }, { component: 'Text', children: '{{$.proposal.intent}}' }],
                    },
                    { component: 'Cell', props: { area: 'doc' }, children: [{ component: 'Code', props: { text: '$.proposal.json' } }] },
                    { component: 'Action', ref: 'save', props: { area: 'save', ink: 'alert', label: 'Save — tide runs it' } },
                  ],
                },
              ],
            },
            else: {
              component: 'Cell',
              props: { area: 'out', mark: 'hatch' },
              children: [{ component: 'Text', children: 'A model writes the automation as a document; you read it; Save hands it to tide, which runs it without asking a model again.' }],
            },
          },
        },
      },
    },
  ],
};
