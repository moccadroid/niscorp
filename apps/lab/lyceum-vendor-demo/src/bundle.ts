import type { ActionDefinition } from '@niscorp/nova';

// ACME'S BUNDLE — what a third party ships to lyceum: data, nothing else.
//
// One action under Acme's own namespace (`ext.<audience>.<integration>.*`, the
// only one intake lets it use), written in lyceum's published component
// vocabulary and drawn by lyceum's kit like everything else on the phone. It
// sends and lists through lyceum's own queries by fingerprint —
// `questions/send` and `questions/mine`, served to every member — so Acme
// needs no server: the question lands in lyceum's
// Q&A, as the person who asked, under the person's policy.
//
// Where it appears is lyceum's business: the phone lists Acme among the things
// the speaker gives people, and until the integration is installed and
// approved there is nothing by that name to place.

const send = [
  { set: 'error', value: '' },
  { call: 'send', onSuccess: [{ set: 'draft', value: '' }, { set: 'sent', value: true }] },
];

export const ask: ActionDefinition = {
  id: 'ext.member.acme.ask',
  title: 'Acme · Ask Anything',
  description: 'Acme Ask Anything: send the speaker a question.',
  data: { draft: '', sent: false, error: '', mine: [] },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick kick', 'field go', 'out out', 'mine mine'], cols: [2, 1] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'Acme · Ask Anything' }] },
      { component: 'Field', ref: 'question', model: '$.draft', props: { area: 'field', value: '$.draft', placeholder: 'Ask the speaker anything', enter: 'clears' } },
      { component: 'Action', ref: 'ask', props: { area: 'go', ink: 'alert', label: 'Ask →' } },
      {
        if: '$.error',
        then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] },
        else: {
          if: '$.sent',
          then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: 'Asked. The speaker has it.' }] },
          else: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', props: { tone: 'muted' }, children: 'An integration, installed from outside this app.' }] },
        },
      },
      {
        component: 'Cell',
        props: { area: 'mine', pad: 'none' },
        children: [{ component: 'Rows', props: { rows: '$.mine', rowKey: 'question_id', empty: 'You have not asked anything yet.', columns: [{ label: 'Your questions', key: 'text', w: 1 }] } }],
      },
    ],
  },
  endpoints: {
    send: { url: '/api/vex', method: 'POST', request: { fingerprint: 'questions/send', context: { text: { $ref: '$.draft' } } }, errorTarget: 'error' },
    // The person's own questions, newest first — lyceum's read, reactive: one
    // asked is on the list on its own.
    mine: { url: '/api/vex', method: 'POST', request: { fingerprint: 'questions/mine', context: {} }, target: 'mine' },
  },
  lifecycle: { mount: [{ call: 'mine' }] },
  triggers: [
    { event: 'ui:click', ref: 'ask', do: send },
    { event: 'ui:key', ref: 'question', key: 'Enter', do: send },
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
