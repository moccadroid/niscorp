import type { ActionDefinition } from '@niscorp/nova';
import { memberMe } from '@lyceum/app/vex/member.entries';
import { phoneLayout } from './phone.layout';
import { markedTabs, toggledStack } from './phone.prism';

// THE PHONE — what everybody who joined has. Their name across the top, read
// reactively (a model writes it while they watch); in the middle a LIST canvas
// (`body`), the actions this phone holds stacked one under another, each as
// tall as it is; and the bar where the thumb is.
//
// `stack` is that list, in order: the ID card first, then whatever is slotted
// in — an integration the speaker installed (Acme), which the phone's boot
// data puts there for whoever is granted it (server/phone.ts), and whatever a
// button on the bar added. The phone reconciles the canvas to `stack`.
//
// THE BAR holds at most two things. `PHONE_BUTTONS` is every action that can
// be a button, in the order they are preferred; what a person gets is the
// ones they are granted, the X-ray's switch first when it was given, and never
// more than two (server/phone.ts). A button slots its action into the list,
// or takes it out again, and is inked while its action is on the list.
//
// THE X-RAY, given on stage, is a switch on the bar, not an action on the list.
// On, the screen shows the actions it is made of, each outlined with its id
// (server/functions/xray.functions.ts sets it in the frame; src/ui/target.ts
// draws it). Tapping an id opens that action, as the JSON document it is, over
// the screen.
export const PHONE_BUTTONS: readonly { action: string; label: string }[] = [
  { action: 'questions.desk', label: 'Q&A' },
  { action: 'assistant.thread', label: 'Assistant' },
];

export const phoneAction: ActionDefinition = {
  id: 'member.phone',
  title: 'Your phone',
  data: {
    me: { member_id: '', name: '', title: '', quirk: '' },
    stack: [{ action: 'member.card' }],
    pressed: '',
    xray: false,
    bar: { areas: [], tabs: [], switches: [] },
  },
  layout: phoneLayout,
  endpoints: {
    me: { url: '/api/vex', method: 'POST', request: { fingerprint: memberMe.fingerprint, context: {} }, target: 'me' },
    xray: { fn: 'xray.set' },
  },
  lifecycle: {
    mount: [{ call: 'me' }, { reconcile: { canvas: 'body', to: '$.stack', action: 'action', own: 'canvas' } }],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'tab',
      do: [
        { set: 'pressed', value: '@event.payload' },
        // A reconcile between the writes: each set is read against the data as
        // the last non-write step left it, and the list is computed from
        // `pressed`, the bar from the list.
        { reconcile: { canvas: 'body', to: '$.stack', action: 'action', own: 'canvas' } },
        { set: 'stack', value: { $prism: toggledStack } },
        { reconcile: { canvas: 'body', to: '$.stack', action: 'action', own: 'canvas' } },
        { set: 'bar.tabs', value: { $prism: markedTabs } },
      ],
    },
    { event: 'ui:click', ref: 'xray', do: [{ toggle: 'xray' }, { call: 'xray' }] },
    // An id tapped on the X-rayed screen: the browser says which instance.
    {
      message: 'xray-open',
      do: [{ push: { action: 'xray.document', canvas: 'overlay', with: ['sheet'], input: { instanceId: '@event.payload.instance', sheetTitle: '@event.payload.action' } } }],
    },
  ],
};
