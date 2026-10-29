import type { ActionDefinition } from '@niscorp/nova';
import { actionSlide, answerSlide, looksSlide, novaSlide, originSlide, problemSlide, questionSlide, terminalSlide, xraySlide } from './opening.actions';
import { buttonSlide } from './moss.actions';
import { checkedSlide, installSlide } from './safety.actions';
import { pressSlide, waterSlide } from './later.actions';
import { copyOf, endOf, registerOf, timerOf, titleOf } from './frame.actions';

export const NOVA_SLIDE_ACTIONS: readonly ActionDefinition[] = [
  titleOf('slide.nova-title', 'Nova', 'The screen is a document.'),
  registerOf('slide.nova-joined'),
  timerOf('slide.nova-timer'),
  copyOf(originSlide, 'slide.nova-origin'),
  copyOf(problemSlide, 'slide.nova-problem'),
  copyOf(answerSlide, 'slide.nova-answer'),
  copyOf(novaSlide, 'slide.nova-ui'),
  copyOf(actionSlide, 'slide.nova-action'),
  copyOf(xraySlide, 'slide.nova-xray'),
  copyOf(buttonSlide, 'slide.nova-button'),
  copyOf(looksSlide, 'slide.nova-looks'),
  copyOf(terminalSlide, 'slide.nova-terminal'),
  copyOf(checkedSlide, 'slide.nova-checked'),
  copyOf(installSlide, 'slide.nova-install'),
  copyOf(questionSlide, 'slide.nova-compare'),
  copyOf(waterSlide, 'slide.nova-water'),
  copyOf(pressSlide, 'slide.nova-press'),
  endOf('slide.nova-end'),
];
