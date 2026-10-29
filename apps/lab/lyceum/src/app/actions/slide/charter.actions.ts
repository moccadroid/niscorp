import type { ActionDefinition } from '@niscorp/nova';
import { DOCUMENT_DEPTH_LIMIT } from '@niscorp/strata';
import { xraySlide } from './opening.actions';
import { agentsSlide, buttonSlide, charterSlide, existsSlide, twiceSlide, whereSlide, wireSlide } from './moss.actions';
import { pressSlide, waterSlide, wordsSlide } from './later.actions';
import { placesLayout } from './moss.layouts';
import { copyOf, endOf, registerOf, timerOf, titleOf } from './frame.actions';

// What the safety research found, attacking with schema-valid documents only
// (TALK.md §7). The depth is the one Strata checks before every parse.
export const brokeSlide: ActionDefinition = {
  id: 'slide.charter-broke',
  title: 'We tried to break it.',
  data: {
    title: 'We tried to break it.',
    places: [
      { area: 'one', what: 'Leak · someone else’s rows', name: 'Held.' },
      { area: 'two', what: 'Crash · a layout 20,000 deep', name: `Refused past ${DOCUMENT_DEPTH_LIMIT}.` },
      { area: 'three', what: 'Explode · a trigger that fires itself', name: 'Stopped.' },
    ],
  },
  layout: placesLayout,
  triggers: [],
};

export const CHARTER_SLIDE_ACTIONS: readonly ActionDefinition[] = [
  titleOf('slide.charter-title', 'Charter', 'What you’re not given doesn’t exist.'),
  registerOf('slide.charter-joined'),
  timerOf('slide.charter-timer'),
  copyOf(whereSlide, 'slide.charter-where'),
  copyOf(existsSlide, 'slide.charter-exists'),
  copyOf(wireSlide, 'slide.charter-wire'),
  copyOf(buttonSlide, 'slide.charter-button'),
  copyOf(xraySlide, 'slide.charter-xray'),
  copyOf(charterSlide, 'slide.charter-file'),
  copyOf(twiceSlide, 'slide.charter-twice'),
  copyOf(wordsSlide, 'slide.charter-words'),
  copyOf(waterSlide, 'slide.charter-water'),
  copyOf(pressSlide, 'slide.charter-press'),
  copyOf(agentsSlide, 'slide.charter-agents'),
  brokeSlide,
  endOf('slide.charter-end'),
];
