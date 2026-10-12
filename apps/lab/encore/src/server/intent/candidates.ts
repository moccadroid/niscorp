import { z } from 'zod';
import type { FetchFn } from '@niscorp/nova';
import { REF_TABLES } from '@encore/app/vex/ref-tables';
import { CANDIDATE_TOKEN_SLOTS } from '@encore/app/vex/candidates.entries';
import type { CandidateSets } from './intent.types';

const MAX_CANDIDATES = 8;

// The session wire unwraps vex's `{ result, meta }`: the rows arrive bare.
const ReplySchema = z.array(z.object({ id: z.string(), label: z.string() }));

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
  // With no tokens every optional condition prunes away, and the read returns rows nobody mentioned.
  if (!source.closed && tokens.length === 0) return [];

  const response = await wire('/api/vex', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fingerprint: source.fingerprint, context: source.closed ? {} : tokenContext(tokens) }),
  });
  // A refusal is the caller's policy not granting this table: no candidates, not an error.
  if (!response.ok) return [];
  const reply = ReplySchema.safeParse(await response.json());
  return reply.success ? reply.data.slice(0, MAX_CANDIDATES) : [];
};

export const readCandidates = async (wire: FetchFn, tables: readonly string[], tokens: readonly string[]): Promise<CandidateSets> => {
  const sets: CandidateSets = {};
  for (const table of tables) sets[table] = await readTable(wire, table, tokens);
  return sets;
};
