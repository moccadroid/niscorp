import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { askRecord, asksKnown } from '@lyceum/app/vex/ask.entries';
import { askEngine } from '../asking';
import type { Asker, Known } from '../asking';
import { vexOver } from '../vex-over';

// THE ASK. Anybody in the room puts a question to the records in their own
// words. This is a function, not an endpoint, for the two things that cannot be
// data (PLAN.md, "Vex is never hidden behind a function"): a model's CHOICE —
// has this been asked before, and what shape is the answer — and a new query's
// GENERATION, which moss's locked endpoints refuse by design.
//
// It never answers. It returns the fingerprint the answer replays by, and the
// phone replays it through vex itself — as the asker, under their policy, the
// same way whether the query is a minute old or was written by somebody else.
// Everything that touches data does so as the asker, over their own wire.

const AskedSchema = z.object({ draft: z.string() });
const KnownSchema = z.array(z.object({ question: z.string(), fingerprint: z.string(), shape: z.string() }));
const MAX_QUESTION = 200;

// What the route hands back: which query answers, in which shape, reached how.
// How that looks is the layouts' (app/actions/shared/answer.layouts.ts).
export type Routed = { fingerprint: string; kind: string; how: 'replayed' | 'generated' };

// ONE QUESTION, ANSWERED THE ASK'S WAY — as the asker, recorded as theirs:
// routed (an earlier question's query, or a new one written under their policy),
// or refused, in words. Shared by the Ask tab and the assistant's `ask` tool,
// so a question is answered the same way whoever carries it.
export const routeQuestion = async (session: FunctionSession, asker: Asker, asked: string): Promise<Routed> => {
  const question = asked.trim().slice(0, MAX_QUESTION);
  if (question === '') throw new Error('Ask something first.');
  const vex = vexOver(session.wire);
  const record = (shape: string, how: 'replayed' | 'generated' | 'refused', fingerprint: string | null): Promise<unknown> =>
    vex(askRecord.fingerprint, { question, shape, how, fingerprint });

  const known: Known[] = KnownSchema.parse(await vex(asksKnown.fingerprint));
  const route = await asker.route(question, known);

  if ('replay' in route) {
    await record(route.replay.shape, 'replayed', route.replay.fingerprint);
    return { fingerprint: route.replay.fingerprint, kind: route.replay.shape, how: 'replayed' };
  }

  const shape = route.generate;
  try {
    const engine = await askEngine(session.runtime, asker);
    const answered = await engine.execute(
      { intent: question, shape: shape.shape, context: {} },
      { scope: { userId: session.principal }, scopePolicy: session.policy },
    );
    const fingerprint = answered.meta.cache.fingerprint;
    if (fingerprint === undefined) throw new Error('the query was answered but not stored');
    await record(shape.kind, 'generated', fingerprint);
    return { fingerprint, kind: shape.kind, how: 'generated' };
  } catch (error) {
    // Refused — by the model (it cannot be answered from what this person
    // may read) or by the engine (what it wrote reaches past their policy).
    // Recorded, and said plainly.
    await record(shape.kind, 'refused', null);
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`The records can't answer that for you. ${reason}`);
  }
};

export const askFunctions = (session: FunctionSession, asker: Asker): Record<string, FunctionHandler> => ({
  'ask.route': async (data) => routeQuestion(session, asker, AskedSchema.parse(data).draft),
});
