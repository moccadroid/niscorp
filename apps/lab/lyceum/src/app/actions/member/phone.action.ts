import type { ActionDefinition } from '@niscorp/nova';
import { memberMe } from '@lyceum/app/vex/member.entries';
import { phoneLayout } from './phone.layout';

// THE PHONE — what everybody who joined has. Their name across the top, read
// reactively (a model writes it while they watch); the body, a canvas that
// shows one thing at a time; and the bar, one button per thing they have.
// Pressed, a button puts that action in the body and becomes the open one.
//
// `buttons` is the bar as authored: every action that can be on it, in order,
// with its word. What a person actually gets is `bar` — the buttons whose
// action they are granted, laid out — derived from their grants when their
// shell is built (server/phone.ts). So something the speaker gives on stage is
// a button for whoever has the grant, and not there for anyone else.
export const PHONE_BUTTONS: readonly { action: string; label: string }[] = [
  { action: 'member.card', label: 'Card' },
  { action: 'questions.desk', label: 'Q&A' },
  { action: 'assistant.thread', label: 'Assistant' },
];

export const phoneAction: ActionDefinition = {
  id: 'member.phone',
  title: 'Your phone',
  data: {
    me: { member_id: '', name: '', title: '', quirk: '' },
    // The body opens on the card (shell/canvases.ts), so the card is open.
    open: 'member.card',
    bar: { areas: [], tabs: [] },
  },
  layout: phoneLayout,
  endpoints: {
    me: { url: '/api/vex', method: 'POST', request: { fingerprint: memberMe.fingerprint, context: {} }, target: 'me' },
  },
  lifecycle: { mount: [{ call: 'me' }] },
  triggers: [{ event: 'ui:click', ref: 'tab', do: [{ set: 'open', value: '@event.payload' }, { resetTo: { action: '@event.payload', canvas: 'body' } }] }],
};
