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
// Idempotent: an existing entry is left alone (seeded rows are protected —
// a drifted request can never replace them either, it 409s). Mutations run
// the authoring lint here — an unkeyed update/delete never reaches the
// cache ("if it boots, it's coherent" for writes).
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
};

// A write seed — the same idea, `kind: 'mutation'`.
export type SeedMutation = {
  fingerprint: string;
  intent?: string;
  mutation: MutationDefinition;
};

export const seedCache = async (cache: CacheBackend, entries: readonly (SeedEntry | SeedMutation)[]): Promise<void> => {
  for (const entry of entries) {
    const existing = await cache.get(entry.fingerprint);
    if (existing !== undefined) continue;

    if ('mutation' in entry) {
      const issues = lintMutation(entry.mutation);
      if (issues.length > 0) {
        throw new Error(`Mutation seed "${entry.fingerprint}" fails the authoring lint:\n  ${issues.join('\n  ')}`);
      }
      await cache.set(entry.fingerprint, {
        kind: 'mutation',
        mutation: entry.mutation,
        ...(entry.intent !== undefined ? { intent: entry.intent } : {}),
        protected: true,
        createdAt: Date.now(),
      });
      continue;
    }

    // Identity IR is seeded explicitly: a NULL mapping would make the reader
    // fall through to the LLM mapper on every replay.
    const prismIr = await compile(entry.mapping ?? { $ref: '$.result' });
    await cache.set(entry.fingerprint, {
      kind: 'ok',
      dsl: entry.dsl,
      prismIr,
      ...(entry.intent !== undefined ? { intent: entry.intent } : {}),
      ...(entry.shape !== undefined ? { shape: entry.shape } : {}),
      protected: true,
      createdAt: Date.now(),
    });
  }
};
