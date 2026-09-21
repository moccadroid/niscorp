import { LINE_TYPE_CHANNEL } from './assist-answer.action';
import type { ActionDefinition } from '@niscorp/nova';
import { intentLineLayout } from './intent-line.layout';

// THE INTENT LINE — the only control in the room.
//
// Every keystroke is a `ui:model` event on a shell that lives on the server, so
// the server has the sentence while it is still being typed. The `model:` write
// lands before triggers fire, which is what lets the trigger be one step: call
// the endpoint, and the handler reads `text` off the data it is handed.
//
// `encore.intent` returns at once with a generation number — the pass it starts
// runs detached, and what it decides arrives as canvases changing, not as this
// call's reply. So nothing here waits, nothing here shows a spinner, and a slow
// decision provider can never make typing feel slow.
//
// No `input`: nothing opens this. It is furniture, mounted by the manifest.
export const intentLineAction: ActionDefinition = {
  id: 'intent.line',
  title: 'Intent',
  description: 'The line the operator types what is happening into; the room assembles itself around it.',
  // `tone` is written by the loop (0 calm · 1 elevated · 2 critical) and is the
  // one thing the sentence changes about the frame in this slice.
  // `heard` is the instant lane: what the parser read and retrieval matched,
  // written by the loop ~10 ms after a keystroke is sent — before the model has
  // been asked anything. Tags, not decisions.
  data: { text: '', generation: 0, tone: 'calm', xray: false, ran: '', warmed: '', heard: [] },
  layout: intentLineLayout,
  endpoints: {
    decide: { fn: 'encore.intent', target: 'generation' },
    // ENTER means "I am done — think about it". The text model normally waits
    // for Jev to call the sentence finished and the line to go quiet; Enter is
    // the operator overruling both, and starts a run at once.
    runNow: { fn: 'encore.run', target: 'ran' },
    // FOCUS is the earliest sign somebody is about to type, and a TLS handshake
    // is most of a cold pass: open the connection while they find the keys.
    warm: { fn: 'encore.warm', target: 'warmed' },
  },
  triggers: [
    { event: 'ui:model', ref: 'line', do: [{ call: 'decide' }] },
    { event: 'ui:key', ref: 'line', key: 'Enter', do: [{ call: 'runNow' }] },
    { event: 'ui:focus', ref: 'line', do: [{ call: 'warm' }] },
    // A FOLLOW-UP CHIP IS TYPING. The answer card announces a sentence; the line
    // takes it as its own text and decides about it exactly as if it had been
    // typed — so a suggested sentence is routed by Jev like any other, and
    // nothing but this line ever starts a pass.
    { message: LINE_TYPE_CHANNEL, do: [{ set: 'text', value: '@event.payload' }, { call: 'decide' }] },
  ],
};
