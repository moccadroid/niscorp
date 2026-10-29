import { z } from 'zod';
import type { FunctionDefinition, FunctionSession } from '@niscorp/moss';
import { QuerySchema } from '@niscorp/vex';
import type { QueryEngine } from '@niscorp/vex';
import { shapeOfKind } from '@lyceum/app/vex/query.shapes';
import { memberSearch } from '@lyceum/app/vex/member.entries';
import { routeQuery } from '../assistant/vex-query';
import { foldStatement } from '../generation';
import type { Querier } from '../querying';

const AskSchema = z.object({ intent: z.string().trim().min(1, 'Type a question first.'), shape: z.string().default('') });
const SearchSchema = z.object({ q: z.string().default(''), bare: z.boolean().default(false) });
const CompileSchema = z.object({ dsl: z.unknown() });
const RowsSchema = z.array(z.object({ name: z.string() }));
// Every `description` in the DSL's JSON schema, at any depth, is an
// instruction the model follows: there is no other text about the grammar.
const DslJsonSchema = z.object({ properties: z.record(z.string(), z.unknown()) });
const countRules = (node: unknown): number => {
  if (typeof node !== 'object' || node === null) return 0;
  if (Array.isArray(node)) return node.reduce<number>((sum, item) => sum + countRules(item), 0);
  return Object.entries(node).reduce((sum, [key, value]) => sum + (key === 'description' && typeof value === 'string' ? 1 : countRules(value)), 0);
};

export const queryFunctions = (session: FunctionSession, querier: Querier, compiler: () => Promise<QueryEngine>): FunctionDefinition[] => [
  {
    id: 'query.ask',
    description: 'Answers a question about the room in words with the stored query that answers it, as the caller: replayed, written, or refused. Send { intent, shape }, shape a shape’s name or empty for Jev to pick; answers { intent, shape, routed }.',
    execute: async (input) => {
      const asked = AskSchema.parse(input);
      const { intent } = asked;
      const given = asked.shape === '' ? undefined : shapeOfKind(asked.shape);
      if (asked.shape !== '' && given === undefined) throw new Error(`There is no shape named "${asked.shape}".`);
      const routed = await routeQuery(session, querier, intent, given);
      const shape = shapeOfKind(routed.kind)?.shape ?? null;
      return { intent, shape: JSON.stringify(shape), routed };
    },
  },
  {
    id: 'room.search',
    description: 'Runs the stored member search as the caller, with the search text or without it, and answers what was sent, the statement, the rows, the context key that was missing and the contract. Send { q, bare }.',
    execute: async (input) => {
      const { q, bare } = SearchSchema.parse(input);
      const context = bare ? {} : { q: `%${q}%` };
      const answered = await session.answerIntent(querier, { fingerprint: memberSearch.fingerprint, context });
      return {
        sent: JSON.stringify({ fingerprint: memberSearch.fingerprint, context }, null, 2),
        sql: foldStatement((await compiler()).compile(memberSearch.dsl).sql),
        rows: RowsSchema.parse(answered.result ?? []),
        missing: (answered.meta.missingContext ?? []).join(', '),
        contract: JSON.stringify(answered.meta.context, null, 2),
      };
    },
  },
  {
    id: 'room.compile',
    description: 'Answers the statement the engine compiles for a query document, folded at its clauses, and the lines that join. Send { dsl }; answers { sql, marked }.',
    execute: async (input) => {
      const { dsl } = CompileSchema.parse(input);
      const sql = foldStatement((await compiler()).compile(QuerySchema.parse(dsl)).sql);
      return { sql, marked: sql.split('\n').flatMap((line, index) => (/\bJOIN\b/.test(line) ? [index + 1] : [])) };
    },
  },
  {
    id: 'room.grammar',
    description: 'Answers the query grammar’s fields, and how many instructions its descriptions carry. Send nothing; answers { text, fields, rules }.',
    execute: async () => {
      const schema = (await compiler()).getDslSchema();
      const fields = Object.keys(DslJsonSchema.parse(schema).properties);
      return { text: fields.join('\n'), fields: fields.length, rules: countRules(schema) };
    },
  },
];
