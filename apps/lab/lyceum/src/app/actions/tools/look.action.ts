import type { ActionDefinition } from '@niscorp/nova';
import { allRenderers, setRenderer } from '@lyceum/app/vex/renderer.entries';
import { lookLayout } from './look.layout';

// The controller's switch: which renderer draws each surface — the phones, the
// projector, this controller — DOM, React or Vue, set one surface at a time.
// Pressing one writes that surface's row; every screen of that surface reads it
// reactively and is drawn again (src/ui/target.ts). So is this switch, when
// its own row changes.
export const lookTool: ActionDefinition = {
  id: 'tools.look',
  title: 'The renderers',
  data: { rows: [], surface: '', renderer: '', error: '' },
  layout: lookLayout,
  endpoints: {
    rows: { url: '/api/vex', method: 'POST', request: { fingerprint: allRenderers.fingerprint, context: {} }, target: 'rows' },
    set: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: setRenderer.fingerprint, context: { surface: { $ref: '$.surface' }, renderer: { $ref: '$.renderer' } } },
      errorTarget: 'error',
    },
  },
  lifecycle: { mount: [{ call: 'rows' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'renderer',
      do: [{ set: 'surface', value: '@event.payload.surface' }, { set: 'renderer', value: '@event.payload.renderer' }, { call: 'set' }],
    },
  ],
};
