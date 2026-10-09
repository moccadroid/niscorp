import type { OP_KEYS } from './node.schema';

// ═══════════════════════════════════════════════════════════
// Profiles — named subsets of the ops, for DOCUMENTATION only
// ═══════════════════════════════════════════════════════════
//
// A profile narrows what a prompt teaches, never what the grammar accepts:
// every config is still parsed by the full ConfigSchema, so a config written
// under a profile is an ordinary Prism config, and one using an op outside
// the profile is still valid. What changes is the size of the grammar an
// agent is handed — the full node schema is ~35k characters, most of it the
// per-op descriptions, and an agent that only maps rows into a shape does not
// need the ops strata rewrites documents with.
//
// `getProfileJsonSchema(ops)` (engine/documentation.ts) derives the narrowed
// JSON Schema from the full one; nothing about an op is restated here.

export type OpKey = (typeof OP_KEYS)[number];

// Mapping rows into a caller's shape (vex's shape mapper, prism's mapping
// agent). Every op the repo's authored mappings and endpoint configs use —
// counted across *.entries.ts and *.prism.ts, 2026-09-27 — and the shaping ops
// a mapping plainly needs beside them. Left out: the document-rewriting ops
// ($has, $renameKeys, $update, $assert, $walk) and ops no mapping here has
// needed ($fill, $replace, $keyBy, $entriesOf, $fromEntries, $keys, $values,
// $type, $flatten, $flatMap, $match, $drop, $dateAdd, $startsWith, $endsWith).
export const MAPPING_OPS: readonly OpKey[] = [
  // reading the source
  '$ref', '$const', '$var', '$get', '$with',
  // arrays
  '$map', '$filter', '$reduce', '$slice', '$unique', '$sortBy', '$take', '$pluck',
  // numbers and aggregates
  '$add', '$sub', '$mul', '$div', '$mod', '$round', '$toNumber', '$sum', '$avg', '$count', '$min', '$max',
  // strings
  '$join', '$toString', '$interpolate', '$trim', '$lower', '$upper', '$split',
  // conditions
  '$eq', '$neq', '$gt', '$gte', '$lt', '$lte', '$empty', '$contains', '$not', '$and', '$or',
  // structure
  '$merge', '$coalesce', '$case', '$groupBy', '$pick', '$omit', '$length',
  // dates and locale formatting
  '$date', '$dateDiff', '$localeDate', '$localeMoney', '$localeNumber',
];
