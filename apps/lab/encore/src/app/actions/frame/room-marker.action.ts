import type { ActionDefinition } from '@niscorp/nova';
import { roomMarkerLayout } from './room-marker.layout';

// X-RAY IS UNMISTAKABLE. One shell per principal outlives its terminals, so a
// switch somebody left on is on for whoever opens the page next — and they saw
// probabilities and model names without knowing why. When x-ray is on this says
// so, at the very top, with the way out beside it. When it is off this is an
// empty tree. (It never survives a page load either: room-xray.action.ts.)
export const ROOM_MARKER_ID = 'room.marker';

export const roomMarkerAction: ActionDefinition = {
  id: ROOM_MARKER_ID,
  title: 'X-ray marker',
  description: 'The banner that says the instruments are showing, and turns them off.',
  data: { xray: false, command: 'off', on: false },
  layout: roomMarkerLayout,
  endpoints: { off: { fn: 'encore.xray', target: 'on' } },
  triggers: [{ event: 'ui:click', ref: 'off', do: [{ set: 'command', value: 'off' }, { call: 'off' }] }],
};
