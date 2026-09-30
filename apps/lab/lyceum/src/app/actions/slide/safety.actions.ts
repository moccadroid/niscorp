import type { ActionDefinition } from '@niscorp/nova';
import { aloneLayout, answerLayout } from './opening.layouts';
import { loopLayout, verdictsLayout } from './safety.layouts';

// THE SAFETY SECTION — the claim the talk leans on: a schema-valid document
// cannot leak, cannot crash, cannot explode; the worst it can be is wrong. We
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
  kicker: 'With valid data only',
  verdicts: [
    { area: 'leak', ink: 'live', label: 'Leak', verdict: 'Held', what: 'No request left the server. No table it may not read, however it was named.' },
    { area: 'crash', ink: 'alert', label: 'Crash', verdict: 'Two holes', what: 'A layout nested 20,000 deep. A loop that doubled every turn.' },
    { area: 'explode', ink: 'alert', label: 'Explode', verdict: 'Broke', what: 'Three lines froze the server for everyone.' },
  ],
});

export const loopSlide = still('slide.loop', 'Three lines froze the server.', loopLayout, {
  file: 'the action, reduced',
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
  found: 'Every loop, before it runs.',
  limits: [
    { text: '64 hops deep, 1,024 per chain' },
    { text: '256 levels per document' },
    { text: 'A timeout on every endpoint and query' },
  ],
});

export const reviewSlide = still('slide.review', 'Review the result, not the code.', answerLayout, {
  kicker: 'So',
  line: 'The worst a checked document can be is wrong. That is what testing is for.',
});

export const SAFETY_SLIDES: readonly ActionDefinition[] = [worstSlide, brokeSlide, loopSlide, reviewSlide];
