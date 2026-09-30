import type { ActionDefinition } from '@niscorp/nova';
import { aloneLayout, answerLayout } from './opening.layouts';
import { installLayout, loopLayout, verdictsLayout } from './safety.layouts';

// THE SAFETY SECTION — the claim the talk leans on: a schema-valid document
// cannot leak, cannot crash, cannot run forever; the worst it can be is wrong. We
// tried to break it with valid data first. What broke is history (the fixes:
// 0544867, b05592b, fbc6c7b, c2986c2, 62c6566, 0daab2b, b1ea6e6); the limits
// quoted here are the code's own constants (nova's cause.ts, strata's
// depth.ts).

const code = (...lines: string[]): string => lines.join('\n');

const still = (id: string, title: string, layout: ActionDefinition['layout'], data: Record<string, unknown>): ActionDefinition => ({
  id,
  title,
  data: { title, ...data },
  layout,
  triggers: [],
});

export const worstSlide = still('slide.worst', 'What is the worst a model can write?', aloneLayout, {});

export const brokeSlide = still('slide.broke', 'We tried to break it.', verdictsLayout, {
  kicker: 'Valid documents only',
  verdicts: [
    { area: 'leak', ink: 'live', label: 'Leak data', verdict: 'No' },
    { area: 'crash', ink: 'alert', label: 'Crash it', verdict: '2 bugs' },
    { area: 'explode', ink: 'alert', label: 'Run forever', verdict: 'Yes' },
  ],
});

export const loopSlide = still('slide.loop', 'This froze the server.', loopLayout, {
  file: 'echo.action.ts (shortened)',
  code: code(
    '{',
    "  id: 'echo',",
    '  triggers: [',
    "    { message: 'x',",
    "      do: [{ emit: { channel: 'x' } }] },",
    '  ],',
    '}',
  ),
  marked: [4, 5],
  found: 'Found before it runs.',
  limits: [
    { text: '64 hops' },
    { text: '1,024 per chain' },
    { text: '256 levels' },
    { text: 'Timeouts' },
  ],
});

export const reviewSlide = still('slide.review', 'Review the result, not the code.', answerLayout, {
  kicker: '',
  line: '',
});

// SOMEBODY ELSE'S SCREEN, installed on stage: the install check's answer, live.
// The speaker installs from the controller (tools.integrations); the server
// tells this slide when Acme's state changed (integration-changed), and it
// reads the state again — the same state the controller's tool shows.
const readInstall = [{ call: 'vendor' }];
export const installSlide: ActionDefinition = {
  id: 'slide.install',
  title: 'Installing Acme’s Q&A',
  data: {
    kicker: 'An integration, from GitHub',
    title: 'Installing Acme’s Q&A',
    vendor: { id: '', url: '', status: '', reasons: [] },
  },
  layout: installLayout,
  endpoints: { vendor: { fn: 'integrations.state', target: 'vendor' } },
  lifecycle: { mount: readInstall },
  triggers: [{ message: 'integration-changed', do: readInstall }],
};

export const SAFETY_SLIDES: readonly ActionDefinition[] = [worstSlide, brokeSlide, loopSlide, reviewSlide, installSlide];
