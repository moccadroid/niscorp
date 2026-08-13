// ═══════════════════════════════════════════════════════════
// The agent-facing Vex guide — exported knowledge, not app prose.
//
// Any agent that reads or embeds Vex endpoints injects THIS text
// (plus `handleDiscovery` output for the live per-endpoint facts:
// entities, existing fingerprints, the DSL schema). Apps add only
// their genuinely app-specific lines (URLs, house rules) — they
// never re-explain Vex, so the contract can't drift per app.
// ═══════════════════════════════════════════════════════════

export const vexGuide = (): string =>
  [
    'VEX — how to read data. A Vex endpoint answers POST with a JSON body and returns { result, meta }.',
    '',
    'The request body takes one of three postures:',
    '  1. GENERATE:  { intent, shape, context? } — intent is plain English (all detail: filters, thresholds, sorting, grouping); shape is a JSON EXAMPLE of the output (an ARRAY with one example element returns a LIST; a plain OBJECT returns ONE record; values are type markers: "" 0 false). The result is cached and meta.cache.fingerprint carries its identity.',
    '  2. REPLAY:    { fingerprint, context? } — re-runs the exact cached query. Never regenerates. Unknown fingerprint → error cache_miss.',
    '  3. NAMED SLOT: { fingerprint, intent, shape, context? } — hit when the stored request matches; regenerate-and-replace when it differs (protected slots refuse with fingerprint_protected).',
    '',
    'context — runtime values, bound as SQL parameters:',
    '  - Keys are part of the query\'s contract; VALUES vary freely per call. Replaying one fingerprint with different context values re-runs the same query with new parameters — this is how a search term, an id, a threshold, or a date flows in per call.',
    '  - The query binds ONLY keys you pass at generation. To parameterize a query: name the value in the intent AND pass the key with a real value in context — e.g. intent "companies whose name contains the search text" with context { "q": "acme" }. Replays then pass new values for the same keys.',
    '  - Reserved keys: sortBy (an "entity.field", schema-validated) and sortDir ("asc"|"desc") drive ORDER BY directly on any replay.',
    '  - A value the query filters with ILIKE is a pattern: "%text%" matches contains.',
    '  - OPTIONAL keys: meta.context marks some keys `optional: true`. Those switch a condition ON — send the key and it applies, omit it and the condition is not in the query at all (it does not match everything by accident, and omitting it is never an error). A key marked `absent: true` is one you did not send on this run. This is how one fingerprint answers "everyone", "everyone matching a search", and "one by id".',
    '',
    'result — exactly the requested shape (array, object, or scalar). meta.cache = { hit, fingerprint, replaced? }; meta.missingContext lists REQUIRED context keys you did not send — the query ran without them, so the result is WRONG. Supply the keys and re-run before trusting it. Optional keys never appear there; leaving one out is a choice, not a mistake.',
    '',
    'GET on the same URL returns the endpoint\'s self-description: its entities, the query body contract, and every existing named fingerprint with its intent — check it before generating a query that may already exist.',
  ].join('\n');
