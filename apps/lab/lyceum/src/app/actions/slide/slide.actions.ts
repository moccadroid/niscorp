import type { ActionDefinition } from '@niscorp/nova';
import { OPENING_SLIDES } from './opening.actions';
import { LATER_SLIDES } from './later.actions';
import { SAFETY_SLIDES } from './safety.actions';
import { MOSS_SLIDES } from './moss.actions';
import { censusLayout } from './slide.layouts';

export const censusSlide: ActionDefinition = {
  id: 'slide.census',
  title: 'Is JSON enough for a real app?',
  data: {
    kicker: 'This app',
    title: 'Is JSON enough for a real app?',
    census: { data: 0, renderers: 0, otherRenderers: 0, endpoints: 0, setup: 0, code: 0, share: 0, checks: 0, checkLines: 0 },
  },
  layout: censusLayout,
  endpoints: { census: { fn: 'room.census', target: 'census' } },
  lifecycle: { mount: [{ call: 'census' }] },
  triggers: [],
};

export const SLIDE_ACTIONS: readonly ActionDefinition[] = [...OPENING_SLIDES, censusSlide, ...SAFETY_SLIDES, ...MOSS_SLIDES, ...LATER_SLIDES];
