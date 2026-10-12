import type { ActionDefinition } from '@niscorp/nova';
import { assistAnswerLayout } from './assist-answer.layout';

export const ASSIST_ANSWER_ID = 'assist.answer';
export const THREAD_CHANNEL = 'thread-changed';
export const ATTENTION_CHANNEL = 'attention';
export const LINE_TYPE_CHANNEL = 'line-type';

export const assistAnswerAction: ActionDefinition = {
  id: ASSIST_ANSWER_ID,
  title: 'Agent',
  description: 'The answer to the sentence on the line, as a briefing: the question, the answer in sentences that each cite a card on screen, what was read to give it, the steps of a plan as chips, and up to three follow-up sentences.',
  data: { status: 'running', statusTone: 'mute', by: '', say: '', plain: '', answer: '', segments: [], landed: false, lit: '', lookups: '', reason: '', notes: '', steps: [], progress: '', followUps: [], stepIndex: -1, opened: '' },
  layout: assistAnswerLayout,
  endpoints: {
    openStep: { fn: 'encore.step', target: 'opened' },
  },
  triggers: [
    { event: 'ui:click', ref: 'step', do: [{ set: 'stepIndex', value: '@event.payload' }, { call: 'openStep' }] },
    { event: 'ui:focus', ref: 'answer', do: [{ set: 'lit', value: '@event.payload' }, { emit: { channel: ATTENTION_CHANNEL, payload: '@event.payload' } }] },
    { event: 'ui:blur', ref: 'answer', do: [{ set: 'lit', value: '' }, { emit: { channel: ATTENTION_CHANNEL, payload: '' } }] },
    { message: ATTENTION_CHANNEL, do: [{ set: 'lit', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'followUp', do: [{ emit: { channel: LINE_TYPE_CHANNEL, payload: '@event.payload' } }] },
  ],
};
