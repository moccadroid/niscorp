import type { ActionDefinition } from '@niscorp/nova';
import { slideTools } from '@lyceum/app/vex/deck.entries';

// A tool two slides share stays mounted across the move. This action owns the
// `tools` canvas outright; nothing else puts anything there.
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
