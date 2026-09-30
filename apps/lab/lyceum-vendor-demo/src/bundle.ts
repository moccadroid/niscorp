import type { ActionDefinition } from '@niscorp/nova';

// ACME'S BUNDLE — what a third party ships to lyceum: data, nothing else.
//
// Three actions under Acme's own namespace (`ext.<audience>.<integration>.*`,
// the only one intake lets it use), one per audience lyceum fences off for
// integrations — members, the speaker, the stage — written in lyceum's
// published component vocabulary and drawn by lyceum's kit like everything
// else. They send and read through lyceum's own queries by fingerprint, so
// Acme needs no server: a question lands in lyceum's Q&A as the person who
// asked, and every read runs under the reader's own policy.
//
//   ext.member.acme.ask         the phone: ask, and see what you asked
//   ext.speaker.acme.questions  the controller: every question, and what the
//                               moderator made of it — fit, not fit, not yet
//   ext.stage.acme.questions    the last slide: the questions fit to show
//
// Where each goes is declared here (`attachments`) and checked at intake
// against the seats lyceum offers; until the integration is installed and
// approved there is nothing by these names to place.

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

// ── the speaker's: every question ──
//
// Two of lyceum's reads, side by side: every question with who sent it, and
// every verdict the moderator wrote. Joined where they are drawn: a check for
// fit to show, an x for not, and a question with no verdict yet still there,
// marked as waiting.
const questionsWithVerdicts = {
  $with: {
    let: {
      byId: { $keyBy: { over: { $ref: '$.verdicts' }, as: 'verdict', key: { $get: { from: { $var: 'verdict' }, path: ['question_id'] } } } },
    },
    value: {
      $map: {
        over: { $ref: '$.questions' },
        as: 'question',
        body: {
          $with: {
            let: { verdict: { $get: { from: { $var: 'byId' }, path: [{ $get: { from: { $var: 'question' }, path: ['question_id'] } }], fallback: { $const: null } } } },
            value: {
              $merge: [
                { $var: 'question' },
                {
                  shown: {
                    $case: {
                      branches: [
                        { when: { $eq: [{ $var: 'verdict' }, { $const: null }] }, then: { $const: null } },
                        { when: { $get: { from: { $var: 'verdict' }, path: ['appropriate'] } }, then: { $const: 'check' } },
                      ],
                      else: { $const: 'x' },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
  },
};

export const everyQuestion: ActionDefinition = {
  id: 'ext.speaker.acme.questions',
  title: 'Acme · Every question',
  description: 'Acme Ask Anything, for the speaker: every question the room sent, and whether it is fit to show.',
  data: { questions: [], verdicts: [] },
  layout: {
    component: 'Sheet',
    props: { size: 'fill', areas: ['kick', 'list'], rows: ['auto', 1] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'Acme · Every question' }] },
      {
        component: 'Cell',
        props: { area: 'list', pad: 'none', scroll: 'y' },
        children: [
          {
            component: 'Rows',
            props: {
              rows: { $prism: questionsWithVerdicts },
              rowKey: 'question_id',
              empty: 'No questions yet.',
              columns: [
                { label: 'Question', key: 'text', w: 3 },
                { label: 'From', key: 'sender', w: 1.2 },
                { label: 'Shown', key: 'shown', kind: 'sigil', w: 0.6, missing: '…' },
              ],
            },
          },
        ],
      },
    ],
  },
  // Both reactive on lyceum's side: a question sent, or a verdict written,
  // answers again on its own.
  endpoints: {
    questions: { url: '/api/vex', method: 'POST', request: { fingerprint: 'questions/every', context: {} }, target: 'questions' },
    verdicts: { url: '/api/vex', method: 'POST', request: { fingerprint: 'questions/verdicts', context: {} }, target: 'verdicts' },
  },
  lifecycle: { mount: [{ call: 'questions' }, { call: 'verdicts' }] },
  triggers: [],
};

// ── the stage's: what may be shown ──
//
// lyceum's `questions/shown` — only what its moderator found fit, and no names:
// lyceum's engine gives the projector nothing else to read.
export const fitQuestions: ActionDefinition = {
  id: 'ext.stage.acme.questions',
  title: 'Acme · Questions',
  description: 'Acme Ask Anything, on the projector: the questions fit to show, newest first.',
  data: { questions: [] },
  layout: {
    component: 'Rows',
    props: {
      rows: '$.questions',
      rowKey: 'question_id',
      empty: 'No questions yet.',
      columns: [{ label: 'Question', key: 'text', w: 1 }],
    },
  },
  endpoints: {
    questions: { url: '/api/vex', method: 'POST', request: { fingerprint: 'questions/shown', context: {} }, target: 'questions' },
  },
  lifecycle: { mount: [{ call: 'questions' }] },
  triggers: [],
};

export const ACME_BUNDLE = {
  integration: 'acme',
  // The grammars these documents are written in; the host upgrades from here.
  // lyceum.kit 9: the check and the x.
  grammar: { 'nisc.nova': 2, 'nisc.prism': 1, 'lyceum.kit': 9 },
  meta: {
    title: 'Acme Ask Anything',
    tagline: 'Questions for whoever is on stage.',
    description: 'A question box from Acme. It sends through the host\'s own Q&A, as you.',
  },
  actions: { [ask.id]: ask, [everyQuestion.id]: everyQuestion, [fitQuestions.id]: fitQuestions },
  // Which of lyceum's seats each screen rides.
  attachments: { [ask.id]: 'member.phone', [everyQuestion.id]: 'speaker.console', [fitQuestions.id]: 'slide.end' },
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
