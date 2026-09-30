import type { ActionDefinition } from '@niscorp/nova';
import { surfaceRenderer } from '@lyceum/app/vex/renderer.entries';

// WHICH RENDERER DRAWS THIS SCREEN. One marker per surface; the charter grants
// each principal the one for its surface, so a phone, the projector and the
// controller each read their own row — no layout asks who is looking. The
// marker shows nothing: the terminal reads it off the tree and draws the whole
// screen with that renderer (src/ui/target.ts). A reactive read — the speaker
// writes the row, and every screen of that surface is drawn again.
const marker = (surface: string): ActionDefinition => ({
  id: `look.${surface}`,
  title: `The renderer for the ${surface}`,
  data: { look: { renderer: 'dom' } },
  layout: { component: 'Look', props: { look: '$.look.renderer' } },
  endpoints: {
    look: { url: '/api/vex', method: 'POST', request: { fingerprint: surfaceRenderer.fingerprint, context: { surface } }, target: 'look' },
  },
  lifecycle: { mount: [{ call: 'look' }] },
  triggers: [],
});

export const LOOK_ACTIONS: readonly ActionDefinition[] = [marker('phones'), marker('stage'), marker('controller')];
