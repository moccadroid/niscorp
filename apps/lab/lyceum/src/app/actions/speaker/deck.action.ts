import type { ActionDefinition } from '@niscorp/nova';
import { deckCurrent } from '@lyceum/app/vex/deck.entries';

// THE SPEAKER'S DECK — the stage's twin (stage/deck.action.ts), on the
// controller. It shows nothing itself: it keeps the `tools` canvas on the tool
// the slide on screen names (`slides.tool_id`, or `tools.none`), on mount and
// whenever the deck moves. So the controller has the controls a slide needs
// while that slide is up, and nothing else.
const toCurrentTool = [
  { call: 'current', onSuccess: [{ replace: { canvas: 'tools', action: '{{$.current.tool_id}}' } }] },
];

export const speakerDeckAction: ActionDefinition = {
  id: 'speaker.deck',
  title: 'The controller follows the deck',
  data: { current: { slide_id: '', title: '', position: 0, number: 0, tool_id: 'tools.none' } },
  layout: [],
  endpoints: {
    current: { url: '/api/vex', method: 'POST', request: { fingerprint: deckCurrent.fingerprint, context: {} }, target: 'current' },
  },
  lifecycle: { mount: toCurrentTool },
  triggers: [{ message: 'deck-moved', do: toCurrentTool }],
};
