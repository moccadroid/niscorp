import type { ActionDefinition } from '@niscorp/nova';
import { aloneLayout } from './opening.layouts';
import { strataSlide } from './later.actions';
import { newerLayout, readLayout } from './strata.layouts';
import { copyOf, endOf, registerOf, timerOf, titleOf } from './frame.actions';

const UPGRADE = { stored: '', storedAt: 0, read: '', readAt: 0, marked: [], newer: { stamp: '', at: 0, refusal: '' } };

const upgraded = (id: string, title: string, layout: ActionDefinition['layout']): ActionDefinition => ({
  id,
  title,
  data: { kicker: 'Strata', title, upgrade: UPGRADE },
  layout,
  endpoints: { upgrade: { fn: 'room.upgrade', target: 'upgrade' } },
  lifecycle: { mount: [{ call: 'upgrade' }] },
  triggers: [],
});

export const STRATA_SLIDE_ACTIONS: readonly ActionDefinition[] = [
  titleOf('slide.strata-title', 'Strata', 'Your stored screens outlive your components.'),
  registerOf('slide.strata-joined'),
  timerOf('slide.strata-timer'),
  { id: 'slide.strata-problem', title: 'Your components change. Your stored screens don’t.', data: { title: 'Your components change. Your stored screens don’t.' }, layout: aloneLayout, triggers: [] },
  upgraded('slide.strata-read', 'Upgraded when it’s read.', readLayout),
  copyOf(strataSlide, 'slide.strata-list'),
  upgraded('slide.strata-newer', 'Newer than the code: refused.', newerLayout),
  endOf('slide.strata-end'),
];
