import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { QuerySchema } from '@niscorp/vex';
import { shapeOfKind } from '@lyceum/app/vex/query.shapes';
import { memberSearch } from '@lyceum/app/vex/member.entries';
import { routeQuery } from '../assistant/vex-query';
import { foldStatement } from '../generation';
import { queryEngineFor } from '../querying';
import type { Querier } from '../querying';

// THE VEX TALK'S FUNCTIONS — each for what is not data.
//
//   query.ask     a question about the room, in words, from a screen rather
//                 than through the assistant (app/actions/ask/): the one route
//                 a request in words takes (../assistant/vex-query.ts), as the
//                 caller, recorded as theirs. What comes back is the query to
//                 replay, which the screen opens as the person (`query.result`).
//                 An ask may carry its shape, by name; then Jev is not
//                 asked for one.
//   room.search   a stored query that takes a value, run as the caller with
//                 the value or on purpose without it, and answered with the
//                 engine's own meta — which the governed wire leaves out, so
//                 the slide that shows "the key it missed" reads the engine
//                 directly, under the caller's policy, like a generation does.
//   room.compile  the statement the engine compiles for a document, for the
//                 slide that puts the two side by side.
//   room.grammar  the grammar's fields, and how many instructions its
//                 descriptions carry, off the real schema.
const AskSchema = z.object({ intent: z.string().trim().min(1, 'Type a question first.'), shape: z.string().default('') });
const SearchSchema = z.object({ q: z.string().default(''), bare: z.boolean().default(false) });
const CompileSchema = z.object({ dsl: z.unknown() });
const RowsSchema = z.array(z.object({ name: z.string() }));
// The DSL's JSON schema: its top-level properties are the grammar's fields,
// and every `description` in it, at any depth, is an instruction the model is
// told to follow — there is no other text about the grammar.
const DslJsonSchema = z.object({ properties: z.record(z.string(), z.unknown()) });
const countRules = (node: unknown): number => {
  if (typeof node !== 'object' || node === null) return 0;
  if (Array.isArray(node)) return node.reduce<number>((sum, item) => sum + countRules(item), 0);
  return Object.entries(node).reduce((sum, [key, value]) => sum + (key === 'description' && typeof value === 'string' ? 1 : countRules(value)), 0);
};

export const queryFunctions = (session: FunctionSession, querier: Querier): Record<string, FunctionHandler> => ({
  'query.ask': async (input) => {
    const asked = AskSchema.parse(input);
    const { intent } = asked;
    const given = asked.shape === '' ? undefined : shapeOfKind(asked.shape);
    if (asked.shape !== '' && given === undefined) throw new Error(`There is no shape named "${asked.shape}".`);
    const routed = await routeQuery(session, querier, intent, given);
    const shape = shapeOfKind(routed.kind)?.shape ?? null;
    return { intent, shape: JSON.stringify(shape), routed };
  },

  'room.search': async (input) => {
    const { q, bare } = SearchSchema.parse(input);
    const context = bare ? {} : { q: `%${q}%` };
    const engine = await queryEngineFor(session.runtime, querier);
    const answered = await engine.execute({ fingerprint: memberSearch.fingerprint, context }, { scope: { userId: session.principal ?? '' }, scopePolicy: session.policy });
    return {
      sent: JSON.stringify({ fingerprint: memberSearch.fingerprint, context }, null, 2),
      sql: foldStatement(engine.compile(memberSearch.dsl).sql),
      rows: RowsSchema.parse(answered.result ?? []),
      missing: (answered.meta.missingContext ?? []).join(', '),
      contract: JSON.stringify(answered.meta.context, null, 2),
    };
  },

  // The statement, folded at its clauses so it fits a column; the lines that
  // join are marked — the engine wrote them, the document did not.
  'room.compile': async (input) => {
    const { dsl } = CompileSchema.parse(input);
    const engine = await queryEngineFor(session.runtime, querier);
    const sql = foldStatement(engine.compile(QuerySchema.parse(dsl)).sql);
    return { sql, marked: sql.split('\n').flatMap((line, index) => (/\bJOIN\b/.test(line) ? [index + 1] : [])) };
  },

  'room.grammar': async () => {
    const engine = await queryEngineFor(session.runtime, querier);
    const schema = engine.getDslSchema();
    const fields = Object.keys(DslJsonSchema.parse(schema).properties);
    return { text: fields.join('\n'), fields: fields.length, rules: countRules(schema) };
  },
});
