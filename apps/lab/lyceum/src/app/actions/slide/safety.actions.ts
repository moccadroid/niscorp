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
  kicker: 'Using only documents that pass the schema',
  verdicts: [
    { area: 'leak', ink: 'live', label: 'Leak data', verdict: 'Nothing leaked', what: 'No request left the server. Tables it may not read stayed unreadable.' },
    { area: 'crash', ink: 'alert', label: 'Crash the server', verdict: 'Two bugs', what: 'A layout nested 20,000 levels deep. A loop that doubled every step.' },
    { area: 'explode', ink: 'alert', label: 'Run forever', verdict: 'Froze it', what: 'One small action froze the server for everyone.' },
  ],
});

export const loopSlide = still('slide.loop', 'This action froze the server.', loopLayout, {
  file: 'The action (shortened)',
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
  found: 'An action that triggers itself.',
  limits: [
    { text: '64 hops deep, 1,024 per chain' },
    { text: '256 levels per document' },
    { text: 'A timeout on every endpoint and query' },
  ],
});

export const reviewSlide = still('slide.review', 'Nobody has to read these documents. Tests check what they do.', answerLayout, {
  kicker: 'What this means',
  line: 'A document that passes the schema can be wrong. It cannot leak data, crash the server or run forever.',
});

// SOMEBODY ELSE'S SCREEN, installed on stage: the install check's answer, live.
// The speaker installs from the controller (tools.integrations); the server
// tells this slide when Acme's state changed (integration-changed), and it
// reads the state again — the same state the controller's tool shows.
const readInstall = [{ call: 'vendor' }];
export const installSlide: ActionDefinition = {
  id: 'slide.install',
  title: 'Another company wrote a screen for this app.',
  data: {
    kicker: 'An integration: Acme, a JSON file on GitHub',
    title: 'Another company wrote a screen for this app.',
    checks: [
      { text: 'It uses only components this app has.' },
      { text: 'It calls only queries this app has.' },
      { text: 'It shows up only where this app allows.' },
      { text: 'It has no infinite loops.' },
    ],
    vendor: { id: '', url: '', status: '', reasons: [] },
  },
  layout: installLayout,
  endpoints: { vendor: { fn: 'integrations.state', target: 'vendor' } },
  lifecycle: { mount: readInstall },
  triggers: [{ message: 'integration-changed', do: readInstall }],
};

export const SAFETY_SLIDES: readonly ActionDefinition[] = [worstSlide, brokeSlide, loopSlide, reviewSlide, installSlide];
