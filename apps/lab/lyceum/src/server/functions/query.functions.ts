import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { QuerySchema } from '@niscorp/vex';
import { QUERY_SHAPES } from '@lyceum/app/vex/query.shapes';
import { memberSearch } from '@lyceum/app/vex/member.entries';
import { routeQuery } from '../assistant/vex-query';
import { queryEngineFor } from '../querying';
import type { Querier } from '../querying';

// THE VEX TALK'S FUNCTIONS — each for what is not data.
//
//   query.ask     a question about the room, in words, from a screen rather
//                 than through the assistant (app/actions/ask/): the one route
//                 a request in words takes (../assistant/vex-query.ts), as the
//                 caller, recorded as theirs. What comes back is the query to
//                 replay, which the screen opens as the person (`query.result`).
//   room.search   a stored query that takes a value, run as the caller with
//                 the value or on purpose without it, and answered with the
//                 engine's own meta — which the governed wire leaves out, so
//                 the slide that shows "the key it missed" reads the engine
//                 directly, under the caller's policy, like a generation does.
//   room.compile  the statement the engine compiles for a document, for the
//                 slide that puts the two side by side.
//   room.grammar  what the grammar says about itself: the descriptions the
//                 model reads, off the real schema.
const AskSchema = z.object({ intent: z.string().trim().min(1, 'Type a question first.') });
const SearchSchema = z.object({ q: z.string().default(''), bare: z.boolean().default(false) });
const CompileSchema = z.object({ dsl: z.unknown() });
const RowsSchema = z.array(z.object({ name: z.string() }));
// The DSL's JSON schema names a reused definition by reference; a field's
// description is on whichever of the two carries it.
const DescribedSchema = z.object({ description: z.string().optional(), $ref: z.string().optional() }).loose();
const DslJsonSchema = z.object({ properties: z.record(z.string(), DescribedSchema), definitions: z.record(z.string(), DescribedSchema).optional() });
const descriptionOf = (schema: z.infer<typeof DslJsonSchema>, key: string): string | undefined => {
  const field = schema.properties[key];
  if (field === undefined) return undefined;
  const referenced = field.$ref === undefined ? undefined : schema.definitions?.[field.$ref.replace('#/definitions/', '')];
  return field.description ?? referenced?.description;
};

// A long line folded at words, so it fits a slide's column.
const fold = (text: string, width: number): string =>
  text
    .split(/\s+/)
    .reduce<string[]>((lines, word) => {
      const last = lines.at(-1);
      return last !== undefined && `${last} ${word}`.length <= width ? [...lines.slice(0, -1), `${last} ${word}`] : [...lines, word];
    }, [])
    .join('\n');

export const queryFunctions = (session: FunctionSession, querier: Querier): Record<string, FunctionHandler> => ({
  'query.ask': async (input) => {
    const { intent } = AskSchema.parse(input);
    const routed = await routeQuery(session, querier, intent);
    const shape = QUERY_SHAPES.find((entry) => entry.kind === routed.kind)?.shape ?? null;
    return { intent, shape: JSON.stringify(shape), routed };
  },

  'room.search': async (input) => {
    const { q, bare } = SearchSchema.parse(input);
    const context = bare ? {} : { q: `%${q}%` };
    const engine = await queryEngineFor(session.runtime, querier);
    const answered = await engine.execute({ fingerprint: memberSearch.fingerprint, context }, { scope: { userId: session.principal ?? '' }, scopePolicy: session.policy });
    return {
      sent: JSON.stringify({ fingerprint: memberSearch.fingerprint, context }, null, 2),
      sql: engine.compile(memberSearch.dsl).sql,
      rows: RowsSchema.parse(answered.result ?? []),
      missing: (answered.meta.missingContext ?? []).join(', '),
      contract: JSON.stringify(answered.meta.context),
    };
  },

  'room.compile': async (input) => {
    const { dsl } = CompileSchema.parse(input);
    const engine = await queryEngineFor(session.runtime, querier);
    const { sql } = engine.compile(QuerySchema.parse(dsl));
    return { sql, marked: sql.split('\n').flatMap((line, index) => (/\bJOIN\b/.test(line) ? [index + 1] : [])) };
  },

  'room.grammar': async () => {
    const engine = await queryEngineFor(session.runtime, querier);
    const schema = DslJsonSchema.parse(engine.getDslSchema());
    const lines = ['from', 'fields', 'filter'].flatMap((key) => {
      const says = descriptionOf(schema, key);
      return says === undefined ? [] : [fold(`${key} · ${says}`, 58)];
    });
    return { text: lines.join('\n\n') };
  },
});
