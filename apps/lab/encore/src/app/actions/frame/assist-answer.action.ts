import type { ActionDefinition } from '@niscorp/nova';
import { assistAnswerLayout } from './assist-answer.layout';

// THE ANSWER SURFACE. Two minds work this room at two speeds, and this is where
// the second one speaks — as a BRIEFING, not a chat (SCENARIOS.md § First: the
// answer is not a chat).
//
// It is mounted by the SAME PASS that routed the sentence — before the agent has
// been called — so the room says what is coming 300 ms after the thought
// settles. From then on the run manager writes into this instance: the question,
// the answer as SEGMENTS (at most every 120 ms while it streams), what happened
// in the operator's terms (`say`), the steps of a plan, the follow-ups.
//
// EVERY SENTENCE CITES ITS CARD. A segment that carries a `card` is a citation:
// pointing at it — mouse or keyboard, one event — announces that card's key on
// the `attention` channel, and every card in the room is listening (the `placed`
// fragment, shell/fragments). Point at a card and the announcement comes the
// other way: `lit` is set here, and the span that stands on that card lights.
// Neither side knows the other exists; they share a channel and a key. A
// segment with no card is drawn muted once the answer has landed — words with
// nothing to stand on should look like it.
//
// FOLLOW-UPS ARE TYPED, NOT RUN. Pressing one announces its sentence on
// `line-type`; the line takes it as if the operator had typed it, and Jev routes
// it like anything else. Nothing on this card can start an agent.
//
// A plan's steps are chips. Pressing one opens that step's form, prefilled — and
// that is all it does. A step ticks when a PERSON presses that form's button.
//
// The conversation is not here: it is the rail's (`assist.rail`), which outlives
// this card. No `input`: nothing opens this by sentence, the loop mounts it.

export const ASSIST_ANSWER_ID = 'assist.answer';
export const THREAD_CHANNEL = 'thread-changed';
export const ATTENTION_CHANNEL = 'attention';
export const LINE_TYPE_CHANNEL = 'line-type';

export const assistAnswerAction: ActionDefinition = {
  id: ASSIST_ANSWER_ID,
  title: 'Agent',
  description: 'The answer to the sentence on the line, as a briefing: the question, the answer in sentences that each cite a card on screen, what was read to give it, the steps of a plan as chips, and up to three follow-up sentences.',
  // `say` is the run in the operator's terms — what is happening, then what was
  // read and how long it took. `status` is for the badge and the checks.
  data: { status: 'pending', statusTone: 'mute', mode: '', by: '', question: '', say: '', plain: '', answer: '', segments: [], landed: false, xray: false, lit: '', lookups: '', reason: '', notes: '', steps: [], progress: '', followUps: [], stepIndex: -1, opened: '' },
  layout: assistAnswerLayout,
  endpoints: {
    openStep: { fn: 'encore.step', target: 'opened' },
  },
  triggers: [
    { event: 'ui:click', ref: 'step', do: [{ set: 'stepIndex', value: '@event.payload' }, { call: 'openStep' }] },
    // Attention, both ways, over one channel.
    { event: 'ui:focus', ref: 'answer', do: [{ set: 'lit', value: '@event.payload' }, { emit: { channel: ATTENTION_CHANNEL, payload: '@event.payload' } }] },
    { event: 'ui:blur', ref: 'answer', do: [{ set: 'lit', value: '' }, { emit: { channel: ATTENTION_CHANNEL, payload: '' } }] },
    { message: ATTENTION_CHANNEL, do: [{ set: 'lit', value: '@event.payload' }] },
    // The operator's click, handed to the line as the operator's typing.
    { event: 'ui:click', ref: 'followUp', do: [{ emit: { channel: LINE_TYPE_CHANNEL, payload: '@event.payload' } }] },
  ],
};
