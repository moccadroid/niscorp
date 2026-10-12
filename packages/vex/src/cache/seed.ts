import { compile } from '@niscorp/prism';
import type { CacheBackend } from './cache.types.js';
import type { Query } from '../schemas/query.schema.js';
import type { MutationDefinition } from '../mutations/schema.js';
import { lintMutation } from '../mutations/signature.js';
import { canonicalText } from '../utils/canonical.js';
import type { Refresh } from './cache.types.js';

export type SeedEntry = {
  fingerprint: string;
  intent?: string;
  shape?: unknown;
  dsl: Query;
  mapping?: unknown;
  reach?: string;
  refresh?: Refresh;
};

export type SeedMutation = {
  fingerprint: string;
  intent?: string;
  mutation: MutationDefinition;
  reach?: string;
};

// jsonb reorders object keys, so stored definitions are compared in canonical form.
const same = (a: unknown, b: unknown): boolean =>
  a === undefined || b === undefined ? a === b : canonicalText(a) === canonicalText(b);

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

    // The identity is seeded explicitly: an entry with no IR falls through to
    // the LLM mapper on every replay.
    const prismIr = await compile(entry.mapping ?? { $ref: '$.result' });
    // The IR stamps its compile time, so it is compared by meta.fingerprint,
    // prism's hash of the compiled core.
    const current =
      existing?.kind === 'ok' &&
      existing.protected === true &&
      existing.prismIr?.meta.fingerprint === prismIr.meta.fingerprint &&
      same(existing.dsl, entry.dsl) &&
      same(existing.shape, entry.shape) &&
      same(existing.reach, entry.reach) &&
      same(existing.intent, entry.intent) &&
      (existing.refresh ?? 'snapshot') === (entry.refresh ?? 'snapshot');
    if (current) continue;
    await cache.set(entry.fingerprint, {
      kind: 'ok',
      ...(entry.refresh !== undefined ? { refresh: entry.refresh } : {}),
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
