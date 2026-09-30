import type { ActionDefinition } from '@niscorp/nova';

// ACME'S BUNDLE — what a third party ships to lyceum: data, nothing else.
//
// Two screens under Acme's own namespace (`ext.<audience>.<integration>.*`, the
// only one intake lets it use). They are written against lyceum's published
// component vocabulary (Sheet, Cell, Field, Action, …) and call lyceum's own
// queries by fingerprint — `questions/send` and `questions/mine`, served to
// every member — so Acme needs no server: the questions land where lyceum's own
// Q&A puts them, as the person who asked, under the person's policy.
//
// It takes a tab on the phone the way lyceum's own tabs do: the phone lists
// Acme's action among its candidates, and until the integration is installed
// and approved there is nothing by that name to place.

const TAB_INPUT = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    tab: { type: 'boolean', description: 'Render as a tab on the phone: a button with the action\'s name that opens it in the phone\'s body.' },
    tabInk: { type: 'string', enum: ['paper', 'ink'], description: 'The tab\'s ink: `ink` marks the tab whose action is open in the body.' },
  },
  additionalProperties: false,
};

const send = [
  { set: 'error', value: '' },
  { call: 'send', onSuccess: [{ set: 'draft', value: '' }, { set: 'sent', value: true }] },
];

export const ask: ActionDefinition = {
  id: 'ext.member.acme.ask',
  title: 'Ask Anything',
  description: 'Acme Ask Anything: send the speaker a question, and see the ones you sent.',
  data: { tab: false, tabLabel: 'Acme', tabInk: 'paper', nextInk: 'paper', draft: '', sent: false, error: '', mine: [] },
  input: TAB_INPUT,
  layout: {
    if: '$.tab',
    then: { component: 'Action', ref: 'open', props: { ink: '$.tabInk', label: '{{$.tabLabel}}' } },
    else: {
      component: 'Sheet',
      props: { size: 'fill', areas: ['brand', 'field', 'go', 'out', 'mine'], rows: ['auto', 'auto', 'auto', 'auto', 1] },
      children: [
        { component: 'Cell', props: { area: 'brand' }, children: [{ component: 'Label', children: 'Acme · Ask Anything' }] },
        { component: 'Field', ref: 'draft', model: '$.draft', props: { area: 'field', value: '$.draft', placeholder: 'Ask the speaker anything', enter: 'clears' } },
        { component: 'Action', ref: 'send', props: { area: 'go', label: 'Ask →' } },
        {
          if: '$.error',
          then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] },
          else: {
            if: '$.sent',
            then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: 'Asked. The speaker has it.' }] },
            else: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', props: { tone: 'muted' }, children: 'Powered by Acme.' }] },
          },
        },
        {
          component: 'Cell',
          props: { area: 'mine', scroll: 'y' },
          children: [{ component: 'Rows', props: { rows: '$.mine', rowKey: 'question_id', empty: 'Nothing asked yet.', columns: [{ label: '', key: 'text', w: 1 }] } }],
        },
      ],
    },
  },
  endpoints: {
    send: { url: '/api/vex', method: 'POST', request: { fingerprint: 'questions/send', context: { text: { $ref: '$.draft' } } }, errorTarget: 'error' },
    mine: { url: '/api/vex', method: 'POST', request: { fingerprint: 'questions/mine', context: {} }, target: 'mine' },
  },
  lifecycle: { mount: [{ call: 'mine' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'open',
      do: [
        { set: 'nextInk', value: 'ink' },
        { emit: { channel: 'tab-opened' } },
        { resetTo: { action: 'ext.member.acme.ask', canvas: 'body' } },
      ],
    },
    { message: 'tab-opened', do: [{ set: 'tabInk', value: '$.nextInk' }, { set: 'nextInk', value: 'paper' }] },
    { event: 'ui:click', ref: 'send', do: send },
    { event: 'ui:key', ref: 'draft', key: 'Enter', do: send },
  ],
};

export const ACME_BUNDLE = {
  integration: 'acme',
  // The grammars these documents are written in; the host upgrades from here.
  grammar: { 'nisc.nova': 2, 'nisc.prism': 1 },
  meta: {
    title: 'Acme Ask Anything',
    tagline: 'Questions for whoever is on stage.',
    description: 'A question box from Acme. It sends through the host\'s own Q&A, as you.',
  },
  actions: { [ask.id]: ask },
};

// THE SAME BUNDLE, BROKEN: a trigger that re-emits its own channel. Valid
// data — every field parses — and a loop that never ends. Intake refuses it,
// with the path round the loop.
export const ACME_BROKEN_BUNDLE = {
  ...ACME_BUNDLE,
  actions: {
    [ask.id]: {
      ...ask,
      triggers: [...(ask.triggers ?? []), { message: 'acme-echo', do: [{ emit: { channel: 'acme-echo' } }] }],
    },
  },
};
