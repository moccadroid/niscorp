import type { ActionDefinition } from '@niscorp/nova';
import { OPENING_SLIDES } from './opening.actions';
import { LATER_SLIDES } from './later.actions';
import { SAFETY_SLIDES } from './safety.actions';
import { MOSS_SLIDES } from './moss.actions';
import { VEX_SLIDE_ACTIONS } from './vex.actions';
import { NOVA_SLIDE_ACTIONS } from './nova.actions';
import { CHARTER_SLIDE_ACTIONS } from './charter.actions';
import { TIDE_SLIDE_ACTIONS } from './tide.actions';
import { STRATA_SLIDE_ACTIONS } from './strata.actions';
import { SOLID_SLIDE_ACTIONS } from './solid.actions';
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

export const SLIDE_ACTIONS: readonly ActionDefinition[] = [...OPENING_SLIDES, censusSlide, ...SAFETY_SLIDES, ...MOSS_SLIDES, ...LATER_SLIDES, ...VEX_SLIDE_ACTIONS, ...NOVA_SLIDE_ACTIONS, ...CHARTER_SLIDE_ACTIONS, ...TIDE_SLIDE_ACTIONS, ...STRATA_SLIDE_ACTIONS, ...SOLID_SLIDE_ACTIONS];
