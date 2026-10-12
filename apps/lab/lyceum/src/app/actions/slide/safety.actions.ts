import type { ActionDefinition } from '@niscorp/nova';
import { deckStep } from '@lyceum/app/vex/deck.entries';
import { ECHO_TEXT, WRONG_COLOUR_TEXT } from './checked.examples';
import { checkedLayout, installLayout, reviewLayout } from './safety.layouts';

const code = (...lines: string[]): string => lines.join('\n');

const still = (id: string, title: string, layout: ActionDefinition['layout'], data: Record<string, unknown>): ActionDefinition => ({
  id,
  title,
  data: { title, ...data },
  layout,
  triggers: [],
});

export const checkedSlide: ActionDefinition = {
  id: 'slide.checked',
  title: 'A closed grammar can be checked.',
  data: {
    title: 'A closed grammar can be checked.',
    schema: { code: WRONG_COLOUR_TEXT, marked: [3] },
    loop: { code: ECHO_TEXT, marked: [2, 3] },
    said: { schema: '', loop: '' },
    step: { step: 0 },
    runtime: [
      { area: 'one', n: '1', what: 'A model writes.', ink: 'paper' },
      { area: 'two', n: '2', what: 'It’s checked.', ink: 'signal' },
      { area: 'three', n: '3', what: 'Errors go back.', ink: 'alert' },
    ],
  },
  layout: checkedLayout,
  endpoints: {
    said: { fn: 'room.checks', target: 'said' },
    step: { url: '/api/vex', method: 'POST', request: { fingerprint: deckStep.fingerprint, context: {} }, target: 'step' },
  },
  lifecycle: { mount: [{ call: 'said' }, { call: 'step' }] },
  triggers: [],
};

const readInstall = [{ call: 'vendor' }];
export const installSlide: ActionDefinition = {
  id: 'slide.install',
  title: 'Installing someone else’s Q&A',
  data: {
    kicker: 'An external plugin, loaded from GitHub',
    title: 'Installing someone else’s Q&A',
    vendor: { id: '', url: '', status: '', reasons: [], checks: [], culprit: '' },
  },
  layout: installLayout,
  endpoints: { vendor: { fn: 'integrations.state', target: 'vendor' } },
  lifecycle: { mount: readInstall },
  triggers: [{ message: 'integration-changed', do: readInstall }],
};

export const reviewSlide = still('slide.review', 'Review the result, not the code.', reviewLayout, {});

export const SAFETY_SLIDES: readonly ActionDefinition[] = [checkedSlide, reviewSlide, installSlide];
