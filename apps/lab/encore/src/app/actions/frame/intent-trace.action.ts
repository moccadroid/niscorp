import type { ActionDefinition } from '@niscorp/nova';
import { TRACE_SECTIONS, intentTraceLayout } from './intent-trace.layout';

// THE INSTRUMENT. PLAN.md's fifth claim — width is free, depth costs a round
// trip — is a number, and this is where the number is read: how many questions
// went out in the last pass, how many bytes that was, and how long each lane
// took. Widen the catalog and watch `decide` against the typing feel.
//
// It loads nothing. The loop writes one record per pass into this instance,
// the same way it writes chips — a projection of a decision that already
// happened, so the trace can never disagree with the room it is describing.
export const intentTraceAction: ActionDefinition = {
  id: 'intent.trace',
  title: 'Trace',
  description: 'Both clocks, measured: the last decision pass (questions, bytes, per-lane timings, top probabilities) and the run of the text model beside it (status, ms, tokens, route, context packs).',
  data: {
    pass: 0,
    text: '',
    questions: 0,
    bytes: 0,
    decider: '',
    calibrated: false,
    // Milliseconds per lane, as rows so the layout can loop them.
    lanes: [],
    totalMs: 0,
    // Before the pass: how long the text waited to be sent (the pacer's quiet
    // timer, or the pass ahead of it), whether the request rode an open
    // connection, and what the last pre-warm did.
    waitedMs: 0,
    connection: '',
    warm: '',
    // The highest-scoring actions of the pass, mounted or not.
    top: [],
    // THE SECOND CLOCK. What Jev decided about the slow path in that same pass
    // (rows, so the layout loops them), and the text model's run beside it:
    // the pass is milliseconds and the run is seconds, and the gap between the
    // two lines is what the demo is about.
    handoff: [],
    run: [],
    // LAYER THREE. `xray` is the room's one inspection switch, written into
    // every card by the loop. Which sections are open is THIS card's own and the
    // loop never writes it, so it survives every pass and every sentence; the
    // one-line summaries are the loop's.
    xray: false,
    ...Object.fromEntries(TRACE_SECTIONS.flatMap((key) => [[`open_${key}`, false], [`summary_${key}`, '']])),
  },
  layout: intentTraceLayout,
  triggers: TRACE_SECTIONS.flatMap((key) => [
    { event: 'ui:click', ref: `open-${key}`, do: [{ set: `open_${key}`, value: true }] },
    { event: 'ui:click', ref: `close-${key}`, do: [{ set: `open_${key}`, value: false }] },
  ]),
};
