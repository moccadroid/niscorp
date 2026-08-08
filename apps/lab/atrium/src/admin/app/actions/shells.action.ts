import type { ActionDefinition } from '@niscorp/nova';
import { shellsLayout } from './shells.layout';
import { panelTriggers } from './panel';

// LIVING SHELLS — the durable per-principal server shells moss is holding,
// what is mounted on each of their canvases, and the one control that ends a
// session that has stopped working.
//
// The roster is moss's own `shells.list()`, so it cannot drift from the map it
// describes. This pane used to read a note the app kept beside that map, which
// meant a shell was listed until somebody happened to look at it — the wrong
// property for the one screen you open when you have been told something is
// broken.
//
// The read is deliberately thin, and the thinness is the design: principal,
// audience, how many terminals are attached, and the action ids on their
// canvases. Not what they typed, not what they read. The seam has no route
// that could answer those, so no amount of wanting them here would produce
// them.
//
// The WRITE is thin for a different reason. A reset can only do what a shell
// is — a warm cache over the projection — so the worst it can do to the wrong
// person is put them back on their home screen. That is what makes it safe to
// put a button on, and it is also why the button asks twice.
export const shellsAction: ActionDefinition = {
  id: 'admin.shells',
  title: 'Shells',
  data: { shells: {}, selected: {}, loading: true, working: false, arming: false, done: false, error: '' },
  layout: shellsLayout,
  endpoints: {
    load: { fn: 'admin.shells', target: 'shells', errorTarget: 'error' },
    restart: { fn: 'admin.resetShell', errorTarget: 'error' },
  },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { set: 'error', value: '' }], onError: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    // Picking a different shell disarms — an armed restart belongs to the
    // person it was armed for, and carrying it across a selection is how the
    // wrong session gets restarted.
    { event: 'ui:click', ref: 'pick', do: [{ set: 'selected', value: '@event.payload' }, { set: 'arming', value: false }, { set: 'done', value: false }, { set: 'error', value: '' }] },
    { event: 'ui:click', ref: 'arm', do: [{ set: 'arming', value: true }, { set: 'done', value: false }, { set: 'error', value: '' }] },
    { event: 'ui:click', ref: 'cancel', do: [{ set: 'arming', value: false }] },
    // Reload after: the roster the restart just changed is the thing on
    // screen, and a pane that reports a restart while still showing the old
    // stack is asking to be doubted.
    {
      event: 'ui:click',
      ref: 'restart',
      do: [
        { set: 'working', value: true },
        {
          call: 'restart',
          onSuccess: [{ set: 'working', value: false }, { set: 'arming', value: false }, { set: 'done', value: true }, { set: 'selected', value: {} }, { call: 'load' }],
          onError: [{ set: 'working', value: false }, { set: 'arming', value: false }],
        },
      ],
    },
    ...panelTriggers,
  ],
};
