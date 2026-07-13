import { compile } from '@niscorp/prism';
import { computeSchemaFingerprint } from '@niscorp/vex';
import type { CacheBackend, DatabaseSchema } from '@niscorp/vex';
import { readEntries } from '../api/reads';

// ───────────────────────────────────────────────────────────
// Prewarm: turn every authored read entry (src/api/reads.ts)
// into a live vex_cache row under the entry's NAMED fingerprint,
// marked protected. The Prism IR is compiled here — mapping-less
// entries get the identity IR explicitly, because a NULL prism_ir
// would fall through to the (unwired) LLM mapper. After this runs,
// every app read replays its fingerprint and never touches a model.
// ───────────────────────────────────────────────────────────

const IDENTITY_MAPPING = { $ref: '$.result' };

export const prewarmCache = async (cache: CacheBackend, schema: DatabaseSchema): Promise<void> => {
  const schemaFingerprint = computeSchemaFingerprint(schema);
  const seen = new Map<string, string>();

  for (const [name, entry] of Object.entries(readEntries)) {
    const clash = seen.get(entry.fingerprint);
    if (clash !== undefined) {
      throw new Error(`prewarm: '${name}' and '${clash}' share the fingerprint '${entry.fingerprint}' — every name must be distinct`);
    }
    seen.set(entry.fingerprint, name);

    const prismIr = await compile(entry.mapping ?? IDENTITY_MAPPING);
    await cache.set(entry.fingerprint, {
      kind: 'ok',
      dsl: entry.dsl,
      prismIr,
      intent: entry.intent,
      shape: entry.shape,
      createdAt: Date.now(),
      schemaFingerprint,
      protected: true,
    });
  }
};
