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

// The example has the shape of the trigger the broken bundle on the next slide
// carries: it sends what it listens for.
export const checkedSlide = still('slide.checked', 'A closed grammar can be checked.', checkedLayout, {
  code: code('{', "  message: 'x',", "  do: [{ emit: { channel: 'x' } }],", '}'),
  marked: [2, 3],
  found: 'A loop. Found by reading it.',
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
    kicker: 'Another company’s JSON, from GitHub',
    title: 'Installing Acme’s Q&A',
    vendor: { id: '', url: '', status: '', reasons: [], checks: [], culprit: '' },
  },
  layout: installLayout,
  endpoints: { vendor: { fn: 'integrations.state', target: 'vendor' } },
  lifecycle: { mount: readInstall },
  triggers: [{ message: 'integration-changed', do: readInstall }],
};

export const runtimeSlide = still('slide.runtime', 'A model can write it at runtime.', runtimeLayout, {
  from: 'Model',
  to: 'Checks',
  lanes: [
    { label: 'What it wrote', toward: 'to', ink: 'signal' },
    { label: 'What is wrong with it', toward: 'from', ink: 'alert' },
  ],
});

export const reviewSlide = still('slide.review', 'Review the result, not the code.', reviewLayout, {});

export const SAFETY_SLIDES: readonly ActionDefinition[] = [checkedSlide, installSlide, runtimeSlide, reviewSlide];
