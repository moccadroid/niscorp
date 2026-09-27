import type { ActionDefinition } from '@niscorp/nova';
import { roomLook } from '@lyceum/app/vex/room.entries';

// THE LOOK, on every screen. It shows nothing: it renders the `Look` marker
// with the room row's look, and the terminal paints the whole screen with the
// kit that marker names (src/ui/target.ts). A reactive read — the speaker
// writes the row, and every screen in the room repaints; nothing announces it.
export const lookAction: ActionDefinition = {
  id: 'room.look',
  title: 'The look',
  data: { room: { look: 'poster', poster: true, plain: false } },
  layout: { component: 'Look', props: { look: '$.room.look' } },
  endpoints: {
    room: { url: '/api/vex', method: 'POST', request: { fingerprint: roomLook.fingerprint, context: {} }, target: 'room' },
  },
  lifecycle: { mount: [{ call: 'room' }] },
  triggers: [],
};
