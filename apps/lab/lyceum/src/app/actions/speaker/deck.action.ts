import type { ActionDefinition } from '@niscorp/nova';
import { slideTools } from '@lyceum/app/vex/deck.entries';

// THE SPEAKER'S DECK — the stage's twin (stage/deck.action.ts), on the
// controller. It shows nothing itself: on mount and whenever the deck moves it
// reads the tools the slide on screen lists and makes the controller's `tools`
// canvas hold exactly those — every one, in order, stacked (a list canvas). A
// tool two slides share stays mounted across the move. It owns that canvas
// outright; nothing else puts anything there.
const toSlideTools = [
  { call: 'tools', onSuccess: [{ reconcile: { canvas: 'tools', to: '$.tools', action: 'tool_id', own: 'canvas' as const } }] },
];

export const speakerDeckAction: ActionDefinition = {
  id: 'speaker.deck',
  title: 'The controller follows the deck',
  data: { tools: [] },
  layout: [],
  endpoints: {
    tools: { url: '/api/vex', method: 'POST', request: { fingerprint: slideTools.fingerprint, context: {} }, target: 'tools' },
  },
  lifecycle: { mount: toSlideTools },
  triggers: [{ message: 'deck-moved', do: toSlideTools }],
};
