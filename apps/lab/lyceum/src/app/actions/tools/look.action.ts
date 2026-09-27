import type { ActionDefinition } from '@niscorp/nova';
import { TALK_ROOM, roomLook, roomLookSet } from '@lyceum/app/vex/room.entries';
import { lookLayout } from './look.layout';

// The controller's switch for the room's look: two kits, one tree. Pressing
// one writes the room row; every screen — phones, the projector, this one —
// reads it reactively and repaints with that kit.
export const lookTool: ActionDefinition = {
  id: 'tools.look',
  title: 'The look',
  data: { room: { look: 'poster', poster: true, plain: false }, chosen: '', error: '' },
  layout: lookLayout,
  endpoints: {
    room: { url: '/api/vex', method: 'POST', request: { fingerprint: roomLook.fingerprint, context: {} }, target: 'room' },
    set: { url: '/api/vex', method: 'POST', request: { fingerprint: roomLookSet.fingerprint, context: { room: TALK_ROOM, look: { $ref: '$.chosen' } } }, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'room' }] },
  triggers: [{ event: 'ui:click', ref: 'look', do: [{ set: 'chosen', value: '@event.payload' }, { call: 'set' }] }],
};
