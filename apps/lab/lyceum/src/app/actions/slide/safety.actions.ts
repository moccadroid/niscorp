import type { ActionDefinition } from '@niscorp/nova';
import { checkedLayout, installLayout, reviewLayout, runtimeLayout } from './safety.layouts';

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

// One example each. The ink is not one the kit has (ui/kit.ts, INKS), so the
// schema refuses it; the trigger has the shape of the one the broken bundle
// carries, at the end of this section.
export const checkedSlide = still('slide.checked', 'A closed grammar can be checked.', checkedLayout, {
  schema: {
    code: code('{', "  component: 'Action',", "  props: { ink: 'purple' },", '}'),
    marked: [3],
    caught: 'Not a colour this app has.',
  },
  loop: {
    code: code('{', "  message: 'x',", "  do: [{ emit: { channel: 'x' } }],", '}'),
    marked: [2, 3],
    caught: 'Sends what it listens for.',
  },
});

// SOMEBODY ELSE'S JSON, installed on stage: the install check's answer, live.
// The speaker installs from the controller (tools.integrations); the server
// tells this slide when Acme's state changed (integration-changed), and it
// reads the state again — the same state the controller's tool shows.
const readInstall = [{ call: 'vendor' }];
export const installSlide: ActionDefinition = {
  id: 'slide.install',
  title: 'Installing Acme’s Q&A',
  data: {
    kicker: 'An external plugin, loaded from GitHub',
    title: 'Installing Acme’s Q&A',
    vendor: { id: '', url: '', status: '', reasons: [], checks: [], culprit: '' },
  },
  layout: installLayout,
  endpoints: { vendor: { fn: 'integrations.state', target: 'vendor' } },
  lifecycle: { mount: readInstall },
  triggers: [{ message: 'integration-changed', do: readInstall }],
};

export const runtimeSlide = still('slide.runtime', 'Generated at runtime.', runtimeLayout, {
  steps: [
    { area: 'one', n: '1', what: 'A model writes.', ink: 'paper' },
    { area: 'two', n: '2', what: 'It’s validated.', ink: 'signal' },
    { area: 'three', n: '3', what: 'Errors go back.', ink: 'alert' },
  ],
});

export const reviewSlide = still('slide.review', 'Review the result, not the code.', reviewLayout, {});

export const SAFETY_SLIDES: readonly ActionDefinition[] = [checkedSlide, runtimeSlide, reviewSlide, installSlide];
