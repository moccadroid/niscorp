import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { askRecord, asksKnown } from '@lyceum/app/vex/ask.entries';
import { ASK_SHAPES, HOW_SAID } from '@lyceum/app/actions/ask/ask.shapes';
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

// How the phone shows an answer of this shape — handed back with the route,
// because a layout picks a branch by truthiness and cannot look a kind up.
const display = (kind: string): { figure: boolean; columns: unknown[] } => {
  const shape = ASK_SHAPES.find((entry) => entry.kind === kind);
  return { figure: shape?.figure ?? false, columns: shape?.columns ?? [] };
};

export const askFunctions = (session: FunctionSession, asker: Asker): Record<string, FunctionHandler> => ({
  'ask.route': async (data) => {
    const question = AskedSchema.parse(data).draft.trim().slice(0, MAX_QUESTION);
    if (question === '') throw new Error('Ask something first.');
    const vex = vexOver(session.wire);
    const record = (shape: string, how: 'replayed' | 'generated' | 'refused', fingerprint: string | null): Promise<unknown> =>
      vex(askRecord.fingerprint, { question, shape, how, fingerprint });

    const known: Known[] = KnownSchema.parse(await vex(asksKnown.fingerprint));
    const route = await asker.route(question, known);

    if ('replay' in route) {
      await record(route.replay.shape, 'replayed', route.replay.fingerprint);
      return { fingerprint: route.replay.fingerprint, kind: route.replay.shape, how: 'replayed', said: HOW_SAID['replayed'] ?? '', ...display(route.replay.shape) };
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
      return { fingerprint, kind: shape.kind, how: 'generated', said: HOW_SAID['generated'] ?? '', ...display(shape.kind) };
    } catch (error) {
      // Refused — by the model (it cannot be answered from what this person
      // may read) or by the engine (what it wrote reaches past their policy).
      // Recorded, and said plainly.
      await record(shape.kind, 'refused', null);
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`The records can't answer that for you. ${reason}`);
    }
  },
});
