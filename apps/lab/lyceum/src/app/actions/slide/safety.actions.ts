import type { ActionDefinition } from '@niscorp/nova';
import { deckStep } from '@lyceum/app/vex/deck.entries';
import { ECHO_TEXT, WRONG_COLOUR_TEXT } from './checked.examples';
import { checkedLayout, installLayout, reviewLayout } from './safety.layouts';

// THE CHECKS SECTION — what a closed grammar buys. A document in one can be
// checked by a program two ways: its shape, against a schema, and its
// behaviour, by reading it (a loop is found before it runs — a linter can only
// guess at that in code). So a model can write these while the app runs: what
// it writes is checked, and what is wrong goes back to it. And at build time a
// review's quality half is the checks'; what is left is whether it does the
// right thing, which is QA's.

const code = (...lines: string[]): string => lines.join('\n');

const still = (id: string, title: string, layout: ActionDefinition['layout'], data: Record<string, unknown>): ActionDefinition => ({
  id,
  title,
  data: { title, ...data },
  layout,
  triggers: [],
});

// One example each, and what the real check says about it — the documents are
// ./checked.examples.ts, and the server runs the kit's schema and nova's loop
// finder on those same two when the slide mounts (`room.checks`). Shown in
// steps (the deck's `step`, vex/deck.entries.ts): the two documents; then what
// each check said; then what that makes possible — a model writing these while
// the app runs.
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

// SOMEBODY ELSE'S JSON, installed on stage: the install check's answer, live.
// The speaker installs from the controller (tools.integrations); the server
// tells this slide when the QA Company's state changed (integration-changed), and it
// reads the state again — the same state the controller's tool shows.
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
