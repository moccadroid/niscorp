import type { OkCacheEntry } from '@niscorp/vex';
import { compile } from '@niscorp/prism';
import { todosOpen, todosToday, todosDone, todoStats } from './todos';

// ═══════════════════════════════════════════════════════════
// The data API = the description of Vex's PREWARMED CACHE.
//
// Vex is dynamic (a read is { intent, shape, context } → generate → cache →
// serve under a fingerprint). Fable never hits an LLM because these entries
// are seeded into the `vex_cache` table at boot under NAMED fingerprints, and
// every read replays its entry by fingerprint alone (`{ fingerprint, context }`
// on the wire). This file is the human-readable source of that seed.
//
// A CacheEntry IS Vex's own cache row (OkCacheEntry); the authored deltas are
// `fingerprint` (the entry's name — what the prisms reference) and `mapping`
// (uncompiled Prism), which compiles to the row's `prism_ir`. kind/created_at
// are filled by the seed; seeded rows are `protected`.
// ═══════════════════════════════════════════════════════════

export type CacheEntry = Pick<OkCacheEntry, 'shape' | 'dsl' | 'intent'> & {
  fingerprint: string;
  mapping?: unknown;
};

export const ENTRIES: CacheEntry[] = [todosOpen, todosToday, todosDone, todoStats];

// Compile every entry's mapping → prism_ir and emit the cache seed: one INSERT
// per entry into `vex_cache` (the exact columns Vex's own backend writes),
// keyed by the entry's fingerprint and marked `protected`. Dollar-quoted with a
// `$j$` tag so the JSON needs no escaping. Run alongside the data seed at boot
// (vex/runtime.ts).
export const buildCacheSeed = async (): Promise<string> => {
  const stmts: string[] = [];
  for (const e of ENTRIES) {
    // A mapping-less entry is identity: its DSL already aliases columns to the
    // shape's field names, so `$.result` IS the result. Seed that identity IR
    // explicitly — a NULL prism_ir makes Vex's reader fall through to the LLM
    // mapper, which a warm-only engine doesn't have.
    const prismIr = await compile(e.mapping ?? { $ref: '$.result' });
    const prismCol = `$j$${JSON.stringify(prismIr)}$j$::jsonb`;
    stmts.push(
      `INSERT INTO vex_cache (key, kind, intent, shape, dsl, prism_ir, created_at, protected) VALUES (` +
        `$j$${e.fingerprint}$j$, 'ok', $j$${e.intent ?? ''}$j$, ` +
        `$j$${JSON.stringify(e.shape)}$j$::jsonb, $j$${JSON.stringify(e.dsl)}$j$::jsonb, ${prismCol}, now(), true) ` +
        `ON CONFLICT (key) DO NOTHING;`,
    );
  }
  return stmts.join('\n');
};
