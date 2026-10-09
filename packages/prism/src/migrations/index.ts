import type { Sequence } from '@niscorp/strata';
import { ConfigSchema } from '../schemas/config.schema';

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
    {
      // A MARKER for a NARROWING, and a breaking release (approved): a `$` key
      // that is not an op was accepted as a template key and refused when it
      // was evaluated (E_NODE_SHAPE). No step rewrites one — it never evaluated
      // to anything, so there is nothing to rewrite it to. Checked against the
      // corpus: no captured config uses one. What it can break is a config
      // that kept such a key where evaluation never reached it.
      description:
        'A template key never starts with "$": a `$` name that is not an op is refused by the schema, where it was refused only once evaluated',
      steps: [],
    },
    {
      // A MARKER: three additions and one narrowing, and no stored config to
      // rewrite. The additions — a reader at 2 must refuse a config that uses
      // them. The narrowing is of `$ref`: a path with a wildcard, a filter, a
      // slice, a negative index, a quoted key, empty brackets or `..` was
      // accepted and read as "$" (the whole source); it is refused. It is not
      // in the JSON Schema (the pattern is as it was; the parser decides), so
      // the snapshot does not show it and this line is its record. No step
      // rewrites one: it never answered what it asked for, so there is nothing
      // to rewrite it to. Checked against the corpus: no captured config has one.
      description:
        '$mod and $toNumber; $round takes a mode (nearest, floor, ceil); $replace takes all; ' +
        'a $ref path is keys and indexes only: any other JSONPath form is refused, where it was read as "$"',
      steps: [],
    },
  ],
};

// ── the evaluator a migration runs through ──────────────────────
//
// strata runs a document step through an INJECTED transform, nova's socket
// shape `(config, source) => unknown`. That is `evaluate`, from the main
// entry: `createUpgrader(grammars, { transform: evaluate })`.

// ── the schemas behind the kinds ────────────────────────────────
//
// What `nisc.prism/config` means today — read by the grammar check, which
// snapshots it and fails when it changes without a migration here.
export const PRISM_SCHEMAS = { 'nisc.prism/config': ConfigSchema } as const;
