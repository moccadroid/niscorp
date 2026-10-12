import type { ActionDefinition } from '@niscorp/nova';
import { allRenderers, setRenderer } from '@lyceum/app/vex/renderer.entries';
import { lookLayout } from './look.layout';

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
