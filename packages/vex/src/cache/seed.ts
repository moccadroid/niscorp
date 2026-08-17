import { compile } from '@niscorp/prism';
import type { CacheBackend } from './cache.types.js';
import type { Query } from '../schemas/query.schema.js';
import type { MutationDefinition } from '../mutations/schema.js';
import { lintMutation } from '../mutations/signature.js';

// ═══════════════════════════════════════════════════════════════
// Seeding — authored entries → protected cache rows.
//
// The seeds ARE the API surface under the locked posture: every read and
// write an app serves is a named, protected entry, replayed by fingerprint
// (`{ fingerprint, context }` on the wire — definitions never travel).
// This is the machinery every app used to hand-roll; the app authors the
// ENTRIES (content), this compiles and stores them.
//
// Idempotent against a durable cache: a stored row that already matches
// its authored definition is left untouched; anything else at that
// fingerprint — edited, unprotected, regenerated, missing — converges to
// the authored definition, protected. The code is the API surface; the
// surviving rows are not. Protection keeps meaning what it means: a
// drifted REQUEST still 409s — the seed path is the author it serves.
// Mutations run the authoring lint every boot, edits included ("if it
// boots, it's coherent" for writes).
// ═══════════════════════════════════════════════════════════════

// A read seed — vex's own cache row, minus what the seed derives: `mapping`
// is uncompiled Prism (compiled to prism IR here; absent = identity, the
// DSL already aliases columns to the shape's keys).
export type SeedEntry = {
  fingerprint: string;
  intent?: string;
  shape?: unknown;
  dsl: Query;
  mapping?: unknown;
  /** The reach this read requires whatever the caller holds — see `OkCacheEntry.reach`. */
  reach?: string;
};

// A write seed — the same idea, `kind: 'mutation'`.
export type SeedMutation = {
  fingerprint: string;
  intent?: string;
  mutation: MutationDefinition;
  /** The reach this write requires whatever the caller holds — see `MutationCacheEntry.reach`. */
  reach?: string;
};

// Stored definitions round-trip through jsonb, which reorders object keys,
// so equality must be canonical: keys sorted recursively, arrays untouched
// (their order is semantic). A value-order compare would call every row
// "changed" and quietly turn refresh into rewrite-every-boot.
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = canonical(source[key]);
    return sorted;
  }
  return value;
};

const same = (a: unknown, b: unknown): boolean =>
  a === undefined || b === undefined ? a === b : JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

export const seedCache = async (cache: CacheBackend, entries: readonly (SeedEntry | SeedMutation)[]): Promise<void> => {
  for (const entry of entries) {
    const existing = await cache.get(entry.fingerprint);

    if ('mutation' in entry) {
      const issues = lintMutation(entry.mutation);
      if (issues.length > 0) {
        throw new Error(`Mutation seed "${entry.fingerprint}" fails the authoring lint:\n  ${issues.join('\n  ')}`);
      }
      const current =
        existing?.kind === 'mutation' &&
        existing.protected === true &&
        same(existing.mutation, entry.mutation) &&
        same(existing.reach, entry.reach) &&
        same(existing.intent, entry.intent);
      if (current) continue;
      await cache.set(entry.fingerprint, {
        kind: 'mutation',
        mutation: entry.mutation,
        ...(entry.reach !== undefined ? { reach: entry.reach } : {}),
        ...(entry.intent !== undefined ? { intent: entry.intent } : {}),
        protected: true,
        createdAt: Date.now(),
      });
      continue;
    }

    // Identity IR is seeded explicitly: a NULL mapping would make the reader
    // fall through to the LLM mapper on every replay.
    const prismIr = await compile(entry.mapping ?? { $ref: '$.result' });
    // The IR stamps its compile time, so it is compared by meta.fingerprint —
    // prism's hash of the compiled core — never by value.
    const current =
      existing?.kind === 'ok' &&
      existing.protected === true &&
      existing.prismIr?.meta.fingerprint === prismIr.meta.fingerprint &&
      same(existing.dsl, entry.dsl) &&
      same(existing.shape, entry.shape) &&
      same(existing.reach, entry.reach) &&
      same(existing.intent, entry.intent);
    if (current) continue;
    await cache.set(entry.fingerprint, {
      kind: 'ok',
      dsl: entry.dsl,
      prismIr,
      ...(entry.reach !== undefined ? { reach: entry.reach } : {}),
      ...(entry.intent !== undefined ? { intent: entry.intent } : {}),
      ...(entry.shape !== undefined ? { shape: entry.shape } : {}),
      protected: true,
      createdAt: Date.now(),
    });
  }
};
