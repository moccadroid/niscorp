import type { ActionDefinition } from '@niscorp/nova';
import { timerSave } from '@lyceum/app/vex/timer.entries';
import { turnResolve, turnsMine } from '@lyceum/app/vex/assistant.entries';
import { TAB_BUTTON, TAB_INPUT, TAB_OPENED } from '@lyceum/app/actions/shared/tab.layouts';
import { assistantLayout } from './assistant.layout';

// THE ASSISTANT — one action, on every device: a tab on a phone, a tool on the
// controller. What it is for THIS person is not in here: it is assembled on the
// server from the declarations their grants select (app/assistant/assistants.ts)
// and shown at the top — "built from room · records". A turn is a function (a
// model's choice); saving an automation it proposed is the person's own vex
// write; opening an action it proposed is a navigation step, over the screen.
// What a turn OPENED by itself — a query's result — the turn's own success
// reconciles onto the overlay, in the sheet's chrome.
//
// The open trigger's input names every key the catalog declares openable — a
// navigation step resolves its input key by key, and the server fills every one
// from the proposed action's own defaults (`assistant-check` holds the two lists
// to each other).
const run = [
  { set: 'error', value: '' },
  { set: 'answered', value: false },
  { set: 'saved', value: false },
  { set: 'thinking', value: true },
  {
    call: 'turn',
    onSuccess: [
      { set: 'answered', value: true },
      { set: 'thinking', value: false },
      { set: 'draft', value: '' },
      { reconcile: { to: '$.reply.opened', action: 'action', input: 'input', canvas: 'overlay', with: ['sheet'] } },
    ],
    onError: [{ set: 'thinking', value: false }],
  },
];

export const assistantAction: ActionDefinition = {
  id: 'assistant.thread',
  title: 'Your assistant',
  data: {
    tab: false,
    tabLabel: 'Assistant',
    tabInk: 'paper',
    nextInk: 'paper',
    draft: '',
    intro: { title: 'Assistant', builtFrom: '', tools: '' },
    reply: { turnId: '', text: '', proposals: [], opened: [] },
    history: [],
    thinking: false,
    answered: false,
    saved: false,
    chosen: { timerId: '', reflex: {}, intent: '', dueAt: null, dueLocal: '' },
    error: '',
  },
  input: TAB_INPUT,
  layout: { if: '$.tab', then: TAB_BUTTON, else: assistantLayout },
  endpoints: {
    intro: { fn: 'assistant.intro', target: 'intro' },
    turn: { fn: 'assistant.turn', target: 'reply', errorTarget: 'error' },
    save: {
      url: '/api/vex',
      method: 'POST',
      request: {
        fingerprint: timerSave.fingerprint,
        context: {
          timerId: { $ref: '$.chosen.timerId' },
          reflex: { $ref: '$.chosen.reflex' },
          intent: { $ref: '$.chosen.intent' },
          dueAt: { $ref: '$.chosen.dueAt' },
        },
      },
      errorTarget: 'error',
    },
    arm: { fn: 'timers.arm', errorTarget: 'error' },
    // The conversation, its last five turns oldest first — this person's own,
    // reactive: a turn recorded or resolved reaches the screen on its own.
    history: { url: '/api/vex', method: 'POST', request: { fingerprint: turnsMine.fingerprint, context: {} }, target: 'history' },
    // What came of the turn whose proposal was acted on.
    resolve: {
      url: '/api/vex',
      method: 'POST',
      request: {
        fingerprint: turnResolve.fingerprint,
        context: {
          turnId: { $ref: '$.reply.turnId' },
          outcome: { $interpolate: { template: 'Saved · fires at {{at}}', values: { at: { $ref: '$.chosen.dueLocal' } } } },
        },
      },
      errorTarget: 'error',
    },
  },
  lifecycle: { mount: [{ call: 'intro' }, { call: 'history' }] },
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ set: 'nextInk', value: 'ink' }, { emit: { channel: 'tab-opened' } }, { resetTo: { action: 'assistant.thread', canvas: 'body' } }] },
    TAB_OPENED,
    { event: 'ui:click', ref: 'send', do: run },
    { event: 'ui:key', ref: 'draft', key: 'Enter', do: run },
    {
      event: 'ui:click',
      ref: 'save',
      // Saved, armed, and the turn's outcome written — then the proposal is
      // done with: it leaves the screen, and the history says what came of it.
      do: [
        { set: 'error', value: '' },
        { set: 'chosen', value: '@event.payload' },
        { call: 'save', onSuccess: [{ call: 'arm', onSuccess: [{ call: 'resolve', onSuccess: [{ set: 'answered', value: false }, { set: 'saved', value: true }] }] }] },
      ],
    },
    // A query from the conversation, open again — replayed now, as the person.
    {
      event: 'ui:click',
      ref: 'reopen',
      do: [
        {
          push: {
            action: '@event.payload.action',
            canvas: 'overlay',
            with: ['sheet'],
            input: {
              intent: '@event.payload.input.intent',
              shape: '@event.payload.input.shape',
              routed: '@event.payload.input.routed',
              sheetTitle: '@event.payload.input.sheetTitle',
            },
          },
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'proposed',
      do: [
        {
          push: {
            action: '@event.payload.action',
            canvas: 'overlay',
            with: ['sheet'],
            input: {
              draft: '@event.payload.input.draft',
              sheetTitle: '@event.payload.label',
            },
          },
        },
      ],
    },
  ],
};
