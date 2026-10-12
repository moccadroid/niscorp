import { z } from 'zod';
import { defineTool } from '@niscorp/cortex';
import type { ToolDefinition } from '@niscorp/cortex';
import type { FetchFn } from '@niscorp/nova';
import type { ScopePolicy, SeedEntry, SeedMutation, Source } from '@niscorp/vex';
import { canRead } from '@encore/server/intent/context-packs';

// `query` refuses a write before the wire: one refused by the engine is a write that was attempted.

export type ReadToolsConfig = {
  wire: FetchFn;
  policy: ScopePolicy;
  entries: readonly (SeedEntry | SeedMutation)[];
  onRows?: (rows: readonly unknown[]) => void;
};

export type ReadableQuery = { fingerprint: string; returns: string; context: string[] };

export const QUERY_MAX_ROWS = 40;
export const QUERY_MAX_CHARS = 6_000;

const tablesOf = (sources: readonly Source[]): string[] => sources.flatMap((source) => (typeof source === 'string' ? [source] : tablesOf(source.query.from)));

const Json = z.record(z.string(), z.unknown());

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

const capped = (rows: unknown): { rows: unknown[]; note?: string } => {
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

const ContextArgument = Json.nullish().describe('The parameters of that query — exactly the keys list_queries gives under `context`, each with its value, e.g. {"day":"sat"}. Leave out when it takes none.');

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
      if (writes.has(fingerprint)) return { refused: `"${fingerprint}" changes data. You only read; a person makes changes with the forms on screen.` };
      if (!allowed.has(fingerprint)) return { refused: `"${fingerprint}" is not a read available here. Call list_queries for the ones that are.` };

      const response = await config.wire('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint, context: context ?? {} }) });
      if (!response.ok) return { failed: `the read did not run (${response.status}): ${(await response.text()).slice(0, 300)}` };
      const shown = capped(await response.json());
      config.onRows?.(shown.rows);
      return shown;
    },
  });

  return [listQueries, query];
};
