import type { Question } from '@niscorp/signal';
import type { Decider } from '@encore/server/decider/decider';
import { connectionsOpened } from '@encore/server/keep-warm';
import type { Answer, Decided } from './intent.types';

// LANE 4 — DECIDE. One call, as wide as the catalog.
//
// Every question in a `decide()` is answered independently, so the whole tree
// goes out FLAT: "does the swap form belong", "which act", "which stage" and
// "how urgent" travel together and the resolver reads the branches afterwards.
// Width costs bytes; depth would cost a round trip per level, and a round trip
// per level is a room that assembles after the sentence instead of during it.
// `requestBytes` and `durationMs` are recorded on every pass because that
// trade is the thing the demo exists to measure.

// WHAT AN UNCALIBRATED PICK IS WORTH. A chat model emulating `decide()` returns
// picks with no probabilities, and signal refuses to invent a 1.0 for them. So
// a bare "yes" is given exactly the line it has to clear and nothing above it:
// it mounts a card, never out-ranks a calibrated one, and the moment the
// provider hedges at all the card is a chip. The trace says `calibrated:
// false`, so a room built this way never passes for a measured one.
const UNCALIBRATED_YES = 0.8;
const UNCALIBRATED_PICK = 0.6;

// `superseded`: rows the sentence names and then took back (supersede.ts). They
// are already not options; the note is why the line as typed still says them.
export type DecideState = { line: string; heard: Record<string, string | number>; superseded?: string[] };

export const decideQuestions = async (decider: Decider, state: DecideState, questions: Record<string, Question>): Promise<Decided> => {
  // What actually crosses the wire, minus the model name the adapter adds —
  // measured here rather than estimated, because "how wide can a pass get" is
  // a question about exactly this number.
  const requestBytes = Buffer.byteLength(JSON.stringify({ state, questions }));
  // Never beside a warm-up: wait for the one in flight (bounded — decider.ts).
  await decider.ready();
  const started = performance.now();
  const opened = connectionsOpened();
  const result = await decider.signal.decide({ state, questions });
  const durationMs = performance.now() - started;
  // No new connection was opened while this pass was out: it rode a warm one.
  // (Cheap and slightly generous — a pre-warm opening a socket at the same
  // instant would be charged to this pass.)
  const reusedConnection = connectionsOpened() === opened;
  decider.used();

  const answers: Record<string, Answer> = {};
  if (result.calibrated) {
    for (const [name, decision] of Object.entries(result.decisions)) {
      if ('noul' in decision) answers[name] = { kind: 'noul', p: decision.noul };
      else if ('choice' in decision) answers[name] = { kind: 'choice', choice: decision.choice, p: decision.probabilities[decision.choice] ?? 0, confidence: decision.confidence, probabilities: decision.probabilities };
      else answers[name] = { kind: 'score', level: decision.level, confidence: decision.confidence };
    }
  } else {
    for (const [name, decision] of Object.entries(result.decisions)) {
      if ('answer' in decision) answers[name] = { kind: 'noul', p: decision.answer ? UNCALIBRATED_YES : 0 };
      else if ('choice' in decision) answers[name] = { kind: 'choice', choice: decision.choice, p: UNCALIBRATED_PICK, confidence: UNCALIBRATED_PICK };
      else answers[name] = { kind: 'score', level: decision.level, confidence: UNCALIBRATED_PICK };
    }
  }

  return { answers, calibrated: result.calibrated, model: result.meta.model, requestBytes, questionCount: Object.keys(questions).length, durationMs, reusedConnection };
};
