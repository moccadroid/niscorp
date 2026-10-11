import { z } from 'zod';
import type { Filter, SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Pointer } from '../manifest';
import type { OwnEntries, Replay } from './own-entries';

// ═══════════════════════════════════════════════════════════════
// THE GENERATION POINTER'S ROW — read and moved through vex.
//
// `moss_generation` is a table this module owns (./tables.ts): one row, one
// counter, which every process polls to learn that another one changed what
// the app consists of (../manifest, generation.ts, which holds the clock).
//
// It was read and moved by three statements sent straight to the pool, the
// last SQL in moss with no reason to be outside vex. They are two entries now,
// authored like any other and replayed the way a feature's own entries are
// (./own-entries.ts): seeded where no route serves them, under a policy that
// admits this one table. So a data grant on `moss_generation` moves nothing,
// and nobody's charter needs to name it for the server to poll.
//
// THE MOVE IS A COMPARE AND A SET, NOT AN ADDITION. Vex's write grammar sets a
// column to a value; it reads no column, so it cannot say `n = n + 1`. The
// caller reads the counter and this writes the next number WHERE THE COUNTER
// IS STILL WHAT WAS READ. Two processes moving at once cannot both land on one
// number: one of them writes no row, is told so, and reads again.
// ═══════════════════════════════════════════════════════════════

const TABLE = 'moss_generation';
// The one row there is, written by the migration that made the table.
const THE_ROW: Filter = { eq: [`${TABLE}.id`, 1] };

const read: SeedEntry = {
  fingerprint: 'moss/generation',
  intent: 'Where the generation pointer is',
  dsl: { from: [TABLE], fields: [`${TABLE}.n`], filter: THE_ROW, limit: 1 },
};

const move: SeedMutation = {
  fingerprint: 'moss/generation-move',
  intent: 'Move the generation pointer to the next number, if it is still where it was read',
  mutation: {
    op: 'update',
    table: TABLE,
    set: { n: { $context: 'next' } },
    where: { and: [THE_ROW, { eq: [`${TABLE}.n`, { $context: 'seen' }] }] },
  },
};

// The two entries, and the one table the policy they run under admits.
export const POINTER: OwnEntries = { owner: 'the generation pointer', entries: [read, move], tables: [TABLE] };

// What a replay answers. A BIGINT is handed over as a number by one driver and
// as the text of one by another.
const RowSchema = z.object({ n: z.coerce.number() });
const RowsSchema = z.array(z.unknown());

// The pointer the manifest module is handed, over a replay of the two entries.
// The replay is asked for at each use: it is made once, when it is first
// wanted, by whoever hands it over.
export const createPointer = (replay: () => Promise<Replay>): Pointer => ({
  // A pointer with no row reads as zero. One whose `n` is not a number is not
  // a reading: this throws, and whoever polls says that it could not read.
  read: async () => {
    const rows = RowsSchema.parse(await (await replay())(read.fingerprint, {}));
    return RowSchema.parse(rows[0] ?? { n: 0 }).n;
  },
  // A write that changed one row answers that row; one that changed none
  // answers no row, which is the counter having moved since it was read.
  move: async (from) => RowSchema.safeParse(await (await replay())(move.fingerprint, { seen: from, next: from + 1 })).success,
});
