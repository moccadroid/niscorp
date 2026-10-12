import type { ActionDefinition } from '@niscorp/nova';

const send = [
  { set: 'error', value: '' },
  { call: 'send', onSuccess: [{ set: 'draft', value: '' }, { set: 'sent', value: true }] },
];

export const ask: ActionDefinition = {
  id: 'ext.member.qa.ask',
  title: 'QA Company · Ask Anything',
  description: 'QA Company Ask Anything: send the speaker a question.',
  data: { draft: '', sent: false, error: '', mine: [] },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick kick', 'field go', 'out out', 'mine mine'], cols: [2, 1] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'QA Company · Ask Anything' }] },
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
    // Reactive on lyceum's side: a question asked is on the list on its own.
    mine: { url: '/api/vex', method: 'POST', request: { fingerprint: 'questions/mine', context: {} }, target: 'mine' },
  },
  lifecycle: { mount: [{ call: 'mine' }] },
  triggers: [
    { event: 'ui:click', ref: 'ask', do: send },
    { event: 'ui:key', ref: 'question', key: 'Enter', do: send },
  ],
};

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
  id: 'ext.speaker.qa.questions',
  title: 'QA Company · Every question',
  description: 'QA Company Ask Anything, for the speaker: every question the room sent, and whether it is fit to show.',
  data: { questions: [], verdicts: [] },
  layout: {
    component: 'Sheet',
    props: { size: 'fill', areas: ['kick', 'list'], rows: ['auto', 1] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'QA Company · Every question' }] },
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
  // Both reactive on lyceum's side: a question sent or a verdict written
  // arrives on its own.
  endpoints: {
    questions: { url: '/api/vex', method: 'POST', request: { fingerprint: 'questions/every', context: {} }, target: 'questions' },
    verdicts: { url: '/api/vex', method: 'POST', request: { fingerprint: 'questions/verdicts', context: {} }, target: 'verdicts' },
  },
  lifecycle: { mount: [{ call: 'questions' }, { call: 'verdicts' }] },
  triggers: [],
};

export const fitQuestions: ActionDefinition = {
  id: 'ext.stage.qa.questions',
  title: 'QA Company · Questions',
  description: 'QA Company Ask Anything, on the projector: the questions fit to show, newest first.',
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

export const QA_BUNDLE = {
  integration: 'qa',
  grammar: { 'nisc.nova': 2, 'nisc.prism': 1, 'lyceum.kit': 9 },
  actions: { [ask.id]: ask, [everyQuestion.id]: everyQuestion, [fitQuestions.id]: fitQuestions },
  extension: {
    attachments: { [ask.id]: 'member.phone', [everyQuestion.id]: 'speaker.console', [fitQuestions.id]: 'slide.end' },
  },
};

export const QA_BROKEN_BUNDLE = {
  ...QA_BUNDLE,
  actions: {
    ...QA_BUNDLE.actions,
    [ask.id]: {
      ...ask,
      triggers: [...(ask.triggers ?? []), { message: 'qa-echo', do: [{ emit: { channel: 'qa-echo' } }] }],
    },
  },
};
