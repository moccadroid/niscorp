import type { Sequence } from '@niscorp/strata';
import { ConfigSchema, type Config } from '../schemas/config.schema';
import { evaluate } from '../engine/evaluate';
import type { JsonValue } from '../types';

// ═══════════════════════════════════════════════════════════════
// Prism's grammar, as a strata sequence — @niscorp/prism/migrations.
//
// One document kind: a transform config, wherever another grammar keeps one (a
// nova endpoint's request and response, a vex entry's mapping). It declares no
// embeddings: a config nests ops, not documents, and a migration that has to
// reach an op at any depth needs Prism to walk its own tree (`$walk`, strata S3).
//
// Version 0 is the grammar as it stood when strata arrived. The standing rule is
// stronger than for most grammars: a Prism op is never removed or reshaped —
// the old form stays as sugar that desugars to the new — so configs stored as
// migrations never need migrating themselves. This sequence exists for the day
// that rule cannot hold.
// ═══════════════════════════════════════════════════════════════

export const PRISM_SEQUENCE: Sequence = {
  id: 'nisc.prism',
  documents: { config: {} },
  migrations: [
    {
      // A MARKER: every change here is an addition, so no stored config needs
      // rewriting — but a reader at 0 must refuse configs that use them. One
      // narrowing, checked against the corpus (no captured config uses it): the
      // five new op names are no longer accepted as plain template keys.
      description:
        'Transform ops ($has, $renameKeys, $update, $assert, $walk); $ref "$" for the whole source; $join parts may be any node ' +
        'that evaluates to an array; an op name is not a template key',
      steps: [],
    },
  ],
};

// ── the evaluator a migration runs through ──────────────────────
//
// strata runs a document step through an INJECTED transform, nova's socket
// shape `(config, source) => unknown`. This is Prism's, for every host: the
// config is parsed once at the boundary (rule 13; the same object comes back
// for every node it rewrites) and the source must be plain JSON.


const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value === 'object') return Object.values(value).every(isJsonValue);
  return false;
};

const parsedConfigs = new WeakMap<object, Config>();

export const prismTransform = (config: unknown, source: unknown): unknown => {
  if (!isJsonValue(source)) throw new Error('A document to migrate must be plain JSON.');
  const cached = typeof config === 'object' && config !== null ? parsedConfigs.get(config) : undefined;
  const parsed = cached ?? ConfigSchema.parse(config);
  if (cached === undefined && typeof config === 'object' && config !== null) parsedConfigs.set(config, parsed);
  return evaluate(parsed, source);
};

// ── the schemas behind the kinds ────────────────────────────────
//
// What `nisc.prism/config` means today — read by the grammar check, which
// snapshots it and fails when it changes without a migration here.
export const PRISM_SCHEMAS = { 'nisc.prism/config': ConfigSchema } as const;
