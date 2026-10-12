import { z } from 'zod';
import { defineTool, type SignalClient, type ToolDefinition } from '@niscorp/cortex';
import { mappingAgent, MappingAgentInputSchema } from '@niscorp/prism/agent';
import { vexGuide } from '@niscorp/vex';
import type { RayContext } from '../engine';
import { runAction } from './harness';

export type QueryProof = { count: number; contextKeys: string[] };

export type ArchitectTools = {
  discover: ToolDefinition;
  query: ToolDefinition;
  runAction: ToolDefinition;
  map: ToolDefinition;
  proofs: Map<string, QueryProof>;
};

const parseMaybeJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const canonical = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = canonical((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
};

export const makeArchitectTools = (supportLlm: SignalClient, ray: RayContext): ArchitectTools => {
  const proofs = new Map<string, QueryProof>();
  // intent+shape → the fingerprint it minted: models re-send a proven intent
  // with new context instead of replaying the fingerprint, and vex regenerates it.
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
      '- DATE RANGES: prefer LITERAL date strings — a month dropdown carries its own start/end ' +
      '(June = 2026-06-01/2026-06-30), bound into context with $ref. Mind real month lengths (June has 30 days). ' +
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
      // Reasoning models send an untyped field as stringified JSON; a string
      // shape would silently corrupt the cache key and the mapper target.
      const shape = typeof rawShape === 'string' ? parseMaybeJson(rawShape) : rawShape;
      // Failures throw: a returned `{ error }` makes a failed proof look like
      // a successful call in the trace.
      const rt = await ray.engine();
      const ctx = (context ?? {}) as Record<string, unknown>;
      const identity =
        replayFingerprint == null && intent != null
          ? `${intent.trim()}|${JSON.stringify(canonical(shape))}`
          : undefined;
      const memoFp = identity !== undefined ? provenRequests.get(identity) : undefined;
      // A fingerprint means replay, so intent and shape are dropped with it: models
      // attach them anyway, and vex's named-slot posture (fingerprint + intent +
      // shape) 409s on a protected entry and silently replaces an unprotected one.
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
      const fingerprint = res.meta.cache.fingerprint;
      const rows = res.result;
      const bindings = res.meta.context;
      const missing = res.meta.missingContext ?? [];
      const warnings = res.meta.warnings ?? [];
      if (fingerprint !== undefined && missing.length === 0) {
        const requiredKeys = Object.entries(bindings)
          .filter(([, meta]) => meta.kind === 'context')
          .map(([key]) => key);
        proofs.set(fingerprint, { count: Array.isArray(rows) ? rows.length : 1, contextKeys: requiredKeys });
      }
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
