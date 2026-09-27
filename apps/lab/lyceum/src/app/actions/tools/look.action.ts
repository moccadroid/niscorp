import type { ActionDefinition } from '@niscorp/nova';
import { roomLook, roomLookSet } from '@lyceum/app/vex/room.entries';

// The controller's switch for the room's look: two kits, one tree. Pressing
// one writes the room row; every screen — phones, the projector, this one —
// reads it reactively and repaints with that kit.
export const lookTool: ActionDefinition = {
  id: 'tools.look',
  title: 'The look',
  data: { room: { look: 'poster', poster: true, plain: false }, chosen: '', error: '' },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick kick', 'poster plain'] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'The look — the same trees, another kit' }] },
      { component: 'Action', ref: 'look', props: { area: 'poster', ink: { $if: '$.room.poster', $then: 'highlight', $else: 'paper' }, label: 'Poster', value: 'poster' } },
      { component: 'Action', ref: 'look', props: { area: 'plain', ink: { $if: '$.room.plain', $then: 'highlight', $else: 'paper' }, label: 'Plain HTML', value: 'plain' } },
    ],
  },
  endpoints: {
    room: { url: '/api/vex', method: 'POST', request: { fingerprint: roomLook.fingerprint, context: {} }, target: 'room' },
    set: { url: '/api/vex', method: 'POST', request: { fingerprint: roomLookSet.fingerprint, context: { room: 'talk', look: { $ref: '$.chosen' } } }, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'room' }] },
  triggers: [{ event: 'ui:click', ref: 'look', do: [{ set: 'chosen', value: '@event.payload' }, { call: 'set' }] }],
};
