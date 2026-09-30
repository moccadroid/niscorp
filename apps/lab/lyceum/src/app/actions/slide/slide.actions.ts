import type { ActionDefinition } from '@niscorp/nova';
import { OPENING_SLIDES } from './opening.actions';
import { LATER_SLIDES } from './later.actions';
import { SAFETY_SLIDES } from './safety.actions';
import { censusLayout } from './slide.layouts';

// THE SLIDES. Each is an action only the stage is granted; the deck (`slides`
// rows) decides which is on screen and in what order, and which tool the
// speaker's controller shows alongside. The opening is ./opening.actions.ts;
// the census, which the server counts, is here.

// The app's size, counted from its own source by the server as the slide
// mounts — never typed in, so never stale.
export const censusSlide: ActionDefinition = {
  id: 'slide.census',
  title: 'Is JSON enough for a real app?',
  data: {
    kicker: 'The objection, answered by this app',
    title: 'Is JSON enough for a real app?',
    census: { data: 0, renderers: 0, endpoints: 0, setup: 0, code: 0, share: 0, checks: 0, checkLines: 0 },
  },
  layout: censusLayout,
  endpoints: { census: { fn: 'room.census', target: 'census' } },
  lifecycle: { mount: [{ call: 'census' }] },
  triggers: [],
};

export const SLIDE_ACTIONS: readonly ActionDefinition[] = [...OPENING_SLIDES, censusSlide, ...SAFETY_SLIDES, ...LATER_SLIDES];
