import { z } from 'zod';
import { defineTool } from '@niscorp/cortex';
import type { ToolDefinition } from '@niscorp/cortex';
import type { FetchFn } from '@niscorp/nova';
import type { ScopePolicy, SeedEntry, SeedMutation, Source } from '@niscorp/vex';
import { canRead } from '@encore/server/intent/context-packs';

// ═══════════════════════════════════════════════════════════
// THE AGENT'S TWO TOOLS. Both read. Neither touches the screen. There is no
// third tool (DESIGN.md § What it is handed).
//
//   list_queries   which named reads exist for THIS principal — fetched on
//                  demand, not recited in every prompt (atrium: ~1,100 tokens
//                  on every run, and most runs never query);
//   query          replay one of them by fingerprint, as the operator.
//
// REPLAY ONLY. A fingerprint is a row in app/vex — a query somebody wrote,
// reviewed and seeded. The agent cannot compose one, and moss serves the cache
// locked, so even a fingerprint it invented is a refusal, never a generated
// query (PLAN.md D3).
//
// THE ALLOW-SET DERIVES FROM THE SESSION'S POLICY. A read is offered when the
// caller's policy can read EVERY table it touches; a principal with a narrower
// role gets a shorter list, with no list of its own to keep in step. Mutations
// are never in it. And the refusal happens HERE, before the wire: vex would
// refuse too, but a refused write that reached the engine is a write that was
// attempted, and the law is that the agent never attempts one.
//
// A REFUSAL IS THE TOOL'S ANSWER, not an exception: the model reads why and
// tries something that exists.
//
// FLAT ARGUMENTS ONLY. gpt-oss-120b on Groq stringifies nested values inside
// tool arguments, so `context` is asked for as what would arrive anyway — a
// JSON object in a string — and parsed here.
// ═══════════════════════════════════════════════════════════

export type ReadToolsConfig = {
  // The session's own wire: the agent reads as the operator, under their policy.
  wire: FetchFn;
  policy: ScopePolicy;
  entries: readonly (SeedEntry | SeedMutation)[];
};

export type ReadableQuery = { fingerprint: string; returns: string; context: string[] };

// What one lookup may hand back. A model that asked for the running order does
// not need row 41, and a tool result is paid for on every later step.
export const QUERY_MAX_ROWS = 40;
export const QUERY_MAX_CHARS = 6_000;

const tablesOf = (sources: readonly Source[]): string[] => sources.flatMap((source) => (typeof source === 'string' ? [source] : tablesOf(source.query.from)));

const Json = z.record(z.string(), z.unknown());

// Every `{ $context: name }` in a stored query: the parameters a caller binds.
const contextKeysIn = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(contextKeysIn);
  const record = Json.safeParse(value);
  if (!record.success) return [];
  return Object.entries(record.data).flatMap(([key, inner]) => (key === '$context' && typeof inner === 'string' ? [inner] : contextKeysIn(inner)));
};

export const readableQueries = (config: Pick<ReadToolsConfig, 'policy' | 'entries'>): ReadableQuery[] =>
  config.entries.flatMap((entry) => {
    if (!('dsl' in entry)) return [];
    if (!tablesOf(entry.dsl.from).every((table) => canRead(config.policy, table))) return [];
    return [{ fingerprint: entry.fingerprint, returns: entry.intent ?? entry.fingerprint, context: [...new Set(contextKeysIn(entry.dsl))] }];
  });

const capped = (rows: unknown): unknown => {
  const list = Array.isArray(rows) ? rows : [rows];
  const kept: unknown[] = [];
  let size = 0;
  for (const row of list.slice(0, QUERY_MAX_ROWS)) {
    size += JSON.stringify(row).length;
    if (size > QUERY_MAX_CHARS) break;
    kept.push(row);
  }
  return kept.length === list.length ? { rows: kept } : { rows: kept, note: `${list.length - kept.length} more row(s) not shown — narrow the question instead of asking again.` };
};

const ContextArgument = z
  .string()
  .nullish()
  .describe('The parameters of that query, as ONE JSON object in a string — exactly the keys list_queries gives under `context`, e.g. {"day":"sat"}. Leave out when it takes none.');

export const createReadTools = (config: ReadToolsConfig): ToolDefinition[] => {
  const readable = readableQueries(config);
  const allowed = new Set(readable.map((query) => query.fingerprint));
  const writes = new Set(config.entries.flatMap((entry) => ('mutation' in entry ? [entry.fingerprint] : [])));

  const listQueries = defineTool({
    id: 'encore.list_queries',
    name: 'list_queries',
    description: 'List the named reads you may replay with `query`: each with what it returns and the context keys it needs.',
    riskLevel: 'low',
    guide: ['Call this before `query` unless you already know the fingerprint from this conversation.', 'It lists only what this operator may read. It takes no arguments.'],
    input: z.object({}),
    execute: () => ({ queries: readable }),
  });

  const query = defineTool({
    id: 'encore.query',
    name: 'query',
    description: 'Replay ONE named read by its fingerprint and get its rows. Reads only; it cannot change anything.',
    riskLevel: 'low',
    guide: [
      'Only for a figure or a row FACTS does not already hold. Most turns need no lookup at all.',
      'The fingerprint must be one `list_queries` returned. You cannot write a query, and nothing here writes.',
      'A refusal is an answer: read why, then use a fingerprint that exists or say you cannot know.',
    ],
    input: z.object({ fingerprint: z.string().describe('A fingerprint from list_queries, exactly as listed.'), context: ContextArgument }),
    execute: async ({ fingerprint, context }) => {
      // REFUSED BEFORE THE WIRE — both of these return without a request.
      if (writes.has(fingerprint)) return { refused: `"${fingerprint}" changes data. You only read; a person makes changes with the forms on screen.` };
      if (!allowed.has(fingerprint)) return { refused: `"${fingerprint}" is not a read available here. Call list_queries for the ones that are.` };

      let bound: Record<string, unknown> = {};
      if (typeof context === 'string' && context.trim() !== '') {
        try {
          const parsed = Json.safeParse(JSON.parse(context));
          if (!parsed.success) return { refused: '`context` must be a JSON OBJECT in a string, e.g. {"day":"sat"}.' };
          bound = parsed.data;
        } catch {
          return { refused: '`context` is not valid JSON. Send one JSON object in a string, e.g. {"day":"sat"}.' };
        }
      }

      const response = await config.wire('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint, context: bound }) });
      if (!response.ok) return { failed: `the read did not run (${response.status}): ${(await response.text()).slice(0, 300)}` };
      return capped(await response.json());
    },
  });

  return [listQueries, query];
};
