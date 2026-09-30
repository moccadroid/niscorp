import type { ActionDefinition } from '@niscorp/nova';
import { phoneLayout } from './phone.layout';

// THE PHONE — what everybody who joined has.
//
// The tabs are not authored per person. This lists EVERY candidate — the card,
// Q&A, the assistant — and `reconcile` places each as a tab on the `tabs`
// canvas; a candidate this shell was not granted is skipped, exactly as an
// ungranted `initial` candidate is. So the bar is ring 1 made visible: a grant
// that changes rebuilds the shell, this mounts again, and the bar follows.
//
// The list is the bar's ORDER, which is authored. Which actions can be a tab
// is theirs to say (`tab` in their input); deck-check and the phone's checks hold the two to
// each other, so a new tool is not forgotten here.
export const phoneAction: ActionDefinition = {
  id: 'member.phone',
  title: 'Your phone',
  data: {
    tabs: [
      // The body opens on the card, so its tab starts marked.
      { action: 'member.card', input: { tab: true, tabInk: 'ink' } },
      { action: 'questions.desk', input: { tab: true } },
      { action: 'assistant.thread', input: { tab: true } },
    ],
    // What the speaker gives people on stage, over the body: each exists only
    // for a person granted it, so the same reconcile skips it for the rest.
    given: [{ action: 'xray.button', input: {} }],
  },
  layout: phoneLayout,
  lifecycle: {
    mount: [
      { reconcile: { canvas: 'tabs', to: '$.tabs', action: 'action', input: 'input', own: 'canvas' } },
      { reconcile: { canvas: 'given', to: '$.given', action: 'action', input: 'input', own: 'canvas' } },
    ],
  },
  triggers: [],
};
