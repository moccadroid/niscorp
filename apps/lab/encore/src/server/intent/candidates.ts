import { z } from 'zod';
import type { FetchFn } from '@niscorp/nova';
import { REF_TABLES } from '@encore/app/vex/ref-tables';
import { CANDIDATE_TOKEN_SLOTS } from '@encore/app/vex/candidates.entries';
import type { CandidateSets } from './intent.types';

// LANE 2 — CANDIDATES. The rows the model will be allowed to pick among.
//
// Every read here is a vex replay over THE SESSION'S OWN WIRE, so it runs under
// the caller's compiled policy like any card's load does. That is the entire
// security story of retrieval: there is no privileged path from a sentence to a
// table, so a principal is never offered a row they could not have read — and a
// table their policy refuses simply offers nothing.
//
// Only `{ id, label }` comes back, and only labels go on to the provider.

const MAX_CANDIDATES = 8;

// The session wire UNWRAPS vex's `{ result, meta }` for any `/vex` url — the
// same unwrap an action's `target` relies on — so what arrives here is the
// rows themselves, not the envelope a raw HTTP client would see.
const ReplySchema = z.array(z.object({ id: z.string(), label: z.string() }));

// Each token rides twice: `p<n>` is the ilike pattern that finds a word still
// being typed, `t<n>` the raw token pg_trgm compares against a name.
const tokenContext = (tokens: readonly string[]): Record<string, string> =>
  Object.fromEntries(
    tokens.slice(0, CANDIDATE_TOKEN_SLOTS).flatMap((token, index) => [
      [`p${index + 1}`, `%${token}%`],
      [`t${index + 1}`, token],
    ]),
  );

const readTable = async (wire: FetchFn, table: string, tokens: readonly string[]): Promise<CandidateSets[string]> => {
  const source = REF_TABLES[table];
  if (source === undefined) return [];
  // An open table with nothing to search by offers nothing: every optional
  // condition would prune away and the read would return the eight biggest
  // rows, which is a list of acts nobody mentioned.
  if (!source.closed && tokens.length === 0) return [];

  const response = await wire('/api/vex', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fingerprint: source.fingerprint, context: source.closed ? {} : tokenContext(tokens) }),
  });
  // Refused (the policy does not grant this table) or failed: no candidates.
  // Not an error — it is what "you cannot see these rows" looks like from here.
  if (!response.ok) return [];
  const reply = ReplySchema.safeParse(await response.json());
  return reply.success ? reply.data.slice(0, MAX_CANDIDATES) : [];
};

export const readCandidates = async (wire: FetchFn, tables: readonly string[], tokens: readonly string[]): Promise<CandidateSets> => {
  // Sequential on purpose: PGlite is one connection, so parallel reads queue
  // behind each other anyway and only cost the bookkeeping.
  const sets: CandidateSets = {};
  for (const table of tables) sets[table] = await readTable(wire, table, tokens);
  return sets;
};
