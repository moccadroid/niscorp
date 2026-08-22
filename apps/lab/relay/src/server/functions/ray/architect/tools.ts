import { z } from 'zod';
import { defineTool, type SignalClient, type ToolDefinition } from '@niscorp/cortex';
import { mappingAgent, MappingAgentInputSchema } from '@niscorp/prism/agent';
import { vexGuide } from '@niscorp/vex';
import type { RayContext } from '../engine';
import { runAction } from './harness';

// ═══════════════════════════════════════════════════════════
// The architect's tools — truth-checks, not steering. Each carries its own
// `guide` (assembled into TOOL GUIDES on the run): the knowledge travels
// with the tool, never restated in agent instructions or app prose.
//   discover   — the data landscape: real entities/fields + existing
//                named queries. Eyes before intents.
//   query      — read data through Vex to PROVE it (the exact call Ray's
//                query makes), so the agent designs against real rows.
//   run_action — mount a candidate in a throwaway shell and SEE what happens
//                (errors, what each endpoint loaded). Voluntary self-test;
//                the same check judges the final answer.
//   map        — get a Prism transform from the mapping agent. NOT handed to
//                the architect (Vex returns the exact shape asked for, so
//                there is nothing to reshape). Kept for consumers that do
//                need a reshape step.
// ═══════════════════════════════════════════════════════════

// What a query PROVED, per fingerprint — the build's ground truth. The
// harness diffs mounted loads against these instead of guessing what
// "healthy" looks like.
export type QueryProof = { count: number; contextKeys: string[] };

export type ArchitectTools = {
  discover: ToolDefinition;
  query: ToolDefinition;
  runAction: ToolDefinition;
  map: ToolDefinition;
  // Per-build: filled by `query`, read by `run_action` and the pipeline.
  proofs: Map<string, QueryProof>;
};

const parseMaybeJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

// Canonical JSON for request identity — key order must not defeat the memo.
const canonical = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = canonical((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
};

// The one genuine dependency: the LLM for support agents (Vex synthesis
// inside `query` rides the app runtime; `map` runs the Prism mapping agent).
export const makeArchitectTools = (supportLlm: SignalClient, ray: RayContext): ArchitectTools => {
  const proofs = new Map<string, QueryProof>();
  // intent+shape → the fingerprint it minted. Models re-send a proven intent
  // with new context values instead of replaying the fingerprint, and vex
  // regenerates at full price — measured: 109 of 112 build queries were
  // multi-second generations, 3 were replays; one run generated the SAME
  // query seven times. The memo answers a repeat from the existing entry.
  const provenRequests = new Map<string, string>();

  const discover = defineTool({
    id: 'action.discover',
    name: 'discover',
    riskLevel: 'low',
    description:
      'Inspect the data landscape: every entity with its real fields, and the named cached queries that already exist.',
    guide:
      'Call discover BEFORE writing query intents: filter and select on REAL fields only — a field it does not list does not exist ' +
      '(action input names like "scope" are UI vocabulary, not columns). When an existing named query\'s intent already covers a need, ' +
      'replay its fingerprint instead of generating a twin.',
    input: z.object({}),
    execute: async () => {
      const rt = await ray.engine();
      const schema = rt.engine.getSchema();
      if (schema === undefined) return { error: 'schema not introspected yet' };
      const entities = schema.entities.map((entity) => ({
        entity: entity.name,
        fields: entity.fields.map((field) => `${field.name}: ${field.normalizedType}`),
      }));
      const rows = rt.engine.cache.entries !== undefined ? await rt.engine.cache.entries() : [];
      const queries = rows
        .filter((row) => row.entry.kind === 'ok')
        .map((row) => ({ fingerprint: row.key, intent: row.entry.intent ?? '' }));
      return { entities, queries };
    },
  });

  const query = defineTool({
    id: 'action.query',
    name: 'query',
    riskLevel: 'low',
    description:
      'Read data to PROVE it before building. Describe the rows you want as `shape` + `intent` ' +
      '(+ `context` for values that vary). Returns { count, sample, fingerprint } — the real result plus the ' +
      'fingerprint that replays this exact query.',
    // The Vex contract is vex's own exported guide; the fingerprint rules are
    // this tool's own contract. Both travel WITH the tool into every agent
    // that carries it. Plain instructions, no prose.
    guide: () =>
      vexGuide() +
      '\n\nUSING THE RESULT: the result has a `fingerprint`. It replays the exact query you just proved. ' +
      'To load this data in your action, add an endpoint:\n' +
      '{ "url": "/api/vex", "method": "POST", "request": { "fingerprint": "<paste it>", "context": { ... } }, ' +
      '"target": "<data key>" }\n' +
      'The reply IS the query result — the rows land in `target` directly. Do NOT add a `response` transform to ' +
      'unwrap anything (there is no envelope; `$.result` does not exist and the endpoint will FAIL). ' +
      'Only add `response` to RESHAPE rows, and then `$` is the rows array itself.\n' +
      'Rules:\n' +
      '- Copy the fingerprint from the query result, character for character. Never write your own. ' +
      'A fingerprint that did not come from a query result fails at mount with cache_miss and the screen loads nothing.\n' +
      '- The endpoint writes its result to the `target` data key. Declare that key in `data` with a default.\n' +
      '- Call the endpoint from lifecycle.mount.\n' +
      '- To re-run a query that already exists (its fingerprint came from discover or an earlier query call), ' +
      'pass ONLY `fingerprint` (+ `context` values it needs). Unknown fingerprint → error cache_miss.\n' +
      '- OPTIONAL context keys: to prove the "everything" case, OMIT the key entirely — sending "" turns the ' +
      'filter ON with an empty value and matches NOTHING (a count-0 proof of the wrong query).\n' +
      '- NEVER re-send a proven intent. One query family = ONE generation: prove it once, then replay ' +
      '{ "fingerprint": ..., "context": { new values } } for every variation (a different month, a different search text). ' +
      'A replay is instant; re-sending the intent regenerates the query from scratch and wastes seconds per call.\n' +
      '- Call discover first, then write the intent with the real field names.\n' +
      '- DATE RANGES: never compute dates in the endpoint request ($dateAdd there is timezone-shifted and silently drops boundary rows). ' +
      'Carry LITERAL date strings instead: a month dropdown’s options each hold their own {start, end} literals ' +
      '(June = 2026-06-01/2026-06-30), bound into context with $ref — and mind real month lengths (June has 30 days). ' +
      'PROVE the query with the same literal dates, and every filter the intent names must be IN the proven query — a proof whose count ignores a filter is not a proof of the screen.\n' +
      '\nCONTEXT — carrying the proven query\'s context into your endpoint:\n' +
      '- The result\'s `context` lists the bound keys with kinds: "context" = every replay must supply it; ' +
      '"scope" = the server supplies it, never you; "semantic" = fixed from the intent.\n' +
      '- Your endpoint\'s request context supplies a value for every "context"-kind key. ' +
      'A value that follows screen state is a binding over the action data (e.g. "q": { "$ref": "$.search" }).\n' +
      '- SEARCH BOXES: the empty state must list EVERYTHING. Wrap the value in % marks — ' +
      '"q": { "$join": { "parts": ["%", { "$ref": "$.search" }, "%"], "sep": "" } } — so an empty box sends "%%" (matches all) ' +
      'and typing narrows. PROVE the query with a wrapped value too ("%a%", not "a"), and never send a bare search string: ' +
      'an empty one matches nothing and the screen mounts blank.',
    input: z.object({
      fingerprint: z
        .string()
        .nullish()
        .describe(
          'A fingerprint from discover or an earlier query result — replays that exact query. Omit when describing a NEW query with intent + shape.',
        ),
      intent: z
        .string()
        .nullish()
        .describe(
          'For a NEW query: plain English carrying EVERY filter, scope, sort, threshold and derived field, spelled ' +
            'out with real field names (see discover). Anything not written here will NOT be in the query.',
        ),
      shape: z
        .unknown()
        .describe(
          'For a NEW query: a JSON example of what you want back, STRUCTURE ONLY. Placeholder values mean nothing ' +
            'and never filter — every condition goes in the intent. ' +
            'An ARRAY with one example element ([{...}]) returns a LIST of rows; a plain OBJECT returns ONE record. ' +
            'Pass it as JSON DIRECTLY — never as a quoted string.',
        ),
      context: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'Values that vary between runs (a search term, an id, a threshold); name each in the intent.',
        ),
    }),
    execute: async ({ fingerprint: replayFingerprint, intent, shape: rawShape, context }) => {
      // Untyped fields invite stringified JSON from reasoning models
      // (z.unknown() gives them no type signal); a string shape would
      // silently corrupt the cache key and the mapper target.
      const shape = typeof rawShape === 'string' ? parseMaybeJson(rawShape) : rawShape;
      // Failures THROW — the loop records an honest ✗ observation and the
      // model sees `error: …`. Returning `{ error }` here made failed
      // proving look like success in every trace (the v1 flail loop).
      const rt = await ray.engine();
      const ctx = (context ?? {}) as Record<string, unknown>;
      // AUTO-REPLAY: an intent+shape this build already proved IS the same
      // query — serve it from its fingerprint (instant) instead of letting
      // vex regenerate it (seconds), and say so in the reply, so the model
      // learns the replay form. Exact match on canonical intent+shape: safe,
      // and it is the measured repeat class (same wording, new context).
      const identity =
        replayFingerprint == null && intent != null
          ? `${intent.trim()}|${JSON.stringify(canonical(shape))}`
          : undefined;
      const memoFp = identity !== undefined ? provenRequests.get(identity) : undefined;
      // REPLAY POSTURE, CLAMPED. Vex's named-slot posture (fingerprint +
      // intent + shape) 409s on protected entries and silently REPLACES
      // unprotected ones — and every model, told "pass ONLY fingerprint",
      // still attaches shape and bounces off the 409 three times per build
      // (measured). A fingerprint means replay; extras are dropped here so
      // the wasteful posture cannot be expressed at all.
      const res = await rt.engine.execute(
        {
          ...(memoFp !== undefined || replayFingerprint != null
            ? { fingerprint: memoFp ?? (replayFingerprint as string) }
            : {
                ...(intent != null && { intent }),
                ...(shape !== undefined && { shape }),
              }),
          context: ctx,
        },
        { scope: { userId: ray.userId } },
      );
      if (identity !== undefined && memoFp === undefined && res.meta.cache.fingerprint !== undefined) {
        provenRequests.set(identity, res.meta.cache.fingerprint);
      }
      // The proven query's cache identity. The result stays QUERY-shaped
      // (rows + fingerprint) — assembling the endpoint is the agent's job,
      // taught by this tool's guide. The fingerprint replays THIS entry:
      // no drift, no regeneration, no LLM at mount.
      const fingerprint = res.meta.cache.fingerprint;
      const rows = res.result;
      // The query's bindings, from vex itself: name → { type, kind }.
      // kind 'context' = the endpoint must pass it; 'scope' = the server
      // injects it; 'semantic' = resolved from the intent. missingContext
      // names bindings this call did NOT supply — those results are wrong.
      const bindings = res.meta.context;
      const missing = res.meta.missingContext ?? [];
      const warnings = res.meta.warnings ?? [];
      // A result vex flags with missingContext ran WITHOUT required
      // parameters — vex's own meta says it is wrong. It is not a proof:
      // recording it would let the build cite an invalid run as ground
      // truth, and the harness would then bless whatever matched it.
      if (fingerprint !== undefined && missing.length === 0) {
        const requiredKeys = Object.entries(bindings)
          .filter(([, meta]) => meta.kind === 'context')
          .map(([key]) => key);
        proofs.set(fingerprint, { count: Array.isArray(rows) ? rows.length : 1, contextKeys: requiredKeys });
      }
      // A run with missing context is WRONG, and handing back its fingerprint
      // anyway was a trap: the model embedded it, the gate refused it as
      // never-proven, and a build died five retries deep on a token the tool
      // itself had supplied. Withhold it — the only usable fingerprint comes
      // from a run with every required key present.
      const shared = {
        ...(missing.length === 0 && { fingerprint }),
        ...(memoFp !== undefined && {
          note: `You already proved this exact query as ${memoFp} — replayed it with your context. Next time pass { "fingerprint": "${memoFp}", "context": { ... } } directly instead of re-sending the intent.`,
        }),
        context: bindings,
        ...(missing.length > 0 && {
          missingContext: missing,
          note: 'NOT PROVEN — required context keys were missing, so this result is wrong and no usable fingerprint exists. Re-run this exact query with a real value for EVERY key in missingContext; that run returns the fingerprint to use.',
        }),
        ...(warnings.length > 0 && { warnings }),
      };
      if (Array.isArray(rows)) {
        return { count: rows.length, sample: rows.slice(0, 2), ...shared };
      }
      // Reflect the shape semantics back — an object shape means ONE
      // record. If the intent wanted a list, this is the moment to fix
      // the shape, not to build a single-record endpoint under a table.
      return {
        single: rows,
        ...shared,
        note: 'ONE record returned because shape was an OBJECT. If this screen needs a LIST, call query again with shape as an ARRAY: [{...one example row...}].',
      };
    },
  });

  const runActionTool = defineTool({
    id: 'action.run',
    name: 'run_action',
    riskLevel: 'low',
    timeoutMs: 90_000,
    description:
      'Mount a candidate ActionDefinition in a throwaway shell and see what ACTUALLY happens: schema/mount/render ' +
      'errors, and what each endpoint loaded into its target. Use it to check your work before responding — the ' +
      'same check judges your final answer.',
    input: z.object({
      action: z
        .record(z.string(), z.unknown())
        .describe('The complete ActionDefinition JSON (including layout).'),
    }),
    execute: async ({ action }) => {
      const check = await runAction(ray, action, undefined, proofs);
      // Compact what loaded: full row arrays would flood the transcript.
      const data = Object.fromEntries(
        Object.entries(check.data).map(([key, value]) => [
          key,
          Array.isArray(value) ? { rows: value.length, first: value[0] ?? null } : value,
        ]),
      );
      return { ok: check.ok, issues: check.issues, loaded: check.loaded, data };
    },
  });

  const map = defineTool({
    id: 'action.map',
    name: 'map',
    riskLevel: 'low',
    description:
      "Get a Prism transform that maps one shape into another — e.g. an endpoint's raw reply into the " +
      "shape your layout binds against. Returns a `config` to attach as the endpoint's `response` (or `request`). " +
      'You never write these configs yourself — always get them here.',
    input: MappingAgentInputSchema,
    execute: async (args) => {
      const res = await mappingAgent.run(args, { llm: supportLlm }).result;
      if (!res.ok) return { error: res.error.message };
      return { config: res.output.data };
    },
  });

  return { discover, query, runAction: runActionTool, map, proofs };
};
