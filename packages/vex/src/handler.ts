import { z } from 'zod';
import type { QueryEngine } from './types.js';
import type { ScopePolicy, ScopeValues } from './scope/scope.types.js';
import type { DatabaseSchema, EntitySchema } from './schemas/database.schema.js';
import { QueryRequestSchema } from './schemas/request.schema.js';
import { QuerySchema } from './schemas/query.schema.js';
import { isEntryFresh, fireAndForget } from './cache/util.js';
import { computeSchemaFingerprint } from './cache/hash.js';
import { executeWrites } from './mutations/engine.js';
import type { MutationClient, WriteResult } from './mutations/engine.js';
import { collectMutationContext, collectQueryContext, mutationEffect } from './mutations/signature.js';
import type { ContextSignature, MutationEffect } from './mutations/signature.js';
import type { CacheEntry } from './cache/cache.types.js';
import type { Query } from './schemas/query.schema.js';
import { VexError } from './errors.js';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type VexHandlerConfig = {
  engine: QueryEngine;
  entities?: string[];
  // Replay-only posture (production): requests needing generation fail
  // with 'locked'; fingerprint management (PATCH/DELETE) is refused too.
  // Mutation replay is unaffected — writes are ALWAYS replay-only.
  locked?: boolean;
  // Per-request read policy — overrides the engine default for reads on
  // this request (the read-side twin of `mutations.policy`). A host that
  // resolves a policy per principal passes the SAME policy here and in
  // `mutations.policy`, so reads and writes enforce one principal's phases.
  scopePolicy?: ScopePolicy;
  // Compiles the SAME principal's policy at a named reach, for entries that
  // declare one (`OkCacheEntry.reach`). Vex holds neither grants nor behaviors,
  // so it cannot build this itself — the host does, and returning `undefined`
  // refuses the read rather than serving it at the caller's own, wider reach.
  policyForReach?: (reach: string) => Promise<ScopePolicy | undefined> | ScopePolicy | undefined;
  // Enables replay of `kind: 'mutation'` cache entries. The client is
  // structural (PGlite, a pg wrapper, a test double); the policy is the
  // same ScopePolicy reads use, its `write` rules applied by the engine.
  mutations?: {
    client: MutationClient;
    policy: ScopePolicy;
    // The write observer. Fired once per successful mutation replay, AFTER
    // the commit — per-statement writes with the rows the database returned,
    // plus the scope the request could not forge. Vex is the choke point
    // every write passes through, so this is where a host learns about all
    // of them; what the host does with the news (mint facts, wake shells)
    // is not the engine's business. A listener that throws cannot unwrite
    // a committed write, so its error is contained, never the request's.
    onWrite?: (event: WriteEvent) => void;
  };
  // The execution observer — the read/write twin of `mutations.onWrite`, and
  // vex's whole telemetry surface. Fired once per `handleQuery`, AFTER the
  // outcome is known, with vex-vocabulary facts (fingerprint, reach, cache,
  // rows, status, timing) and the unforgeable scope. Vex knows nothing of spans
  // or OTLP; a host maps this record to whatever it emits. Absent → not even the
  // record is built (see `handleQuery`), so an unobserved endpoint pays nothing.
  // A listener that throws is contained, never the request's.
  onExecute?: (record: ExecuteRecord) => void;
};

export type WriteEvent = { fingerprint: string; writes: WriteResult[]; scope: ScopeValues };

// What one execution DID, in vex's own vocabulary — the record `onExecute`
// hands a host. Not a span: vex holds no telemetry model, so a host maps these
// facts to whatever it emits. `startUnixNano`/`endUnixNano` are epoch nanos at
// millisecond anchoring with a sub-millisecond monotonic span between them —
// exact enough for durations, coarse in the low bits — copied through verbatim.
export type ExecuteRecord = {
  kind: 'query' | 'mutation';
  status: 'ok' | 'error' | 'refused';
  fingerprint?: string;
  reach?: string;
  // Reads: whether the entry was already compiled. Mutations always replay.
  cacheHit?: boolean;
  // Rows returned (reads) or written (mutations).
  rows?: number;
  startUnixNano: number;
  endUnixNano: number;
  // The scope the request could not forge, passed exactly as `onWrite` passes
  // it — for a host to read principal PRESENCE from, never a value into a span.
  scope: ScopeValues;
};

// The mutable half of the record, filled by `runQuery` as it goes and read once
// by `handleQuery`. Built only when an observer is attached.
type ExecuteProbe = {
  kind: 'query' | 'mutation';
  fingerprint?: string;
  reach?: string;
  cacheHit?: boolean;
  rows?: number;
};

export type DiscoveryFingerprint = {
  fingerprint: string;
  kind: 'query' | 'mutation';
  protected: boolean;
  schemaFresh: boolean;
  intent?: string;
  createdAt: number;
  lastUsedAt?: number;
  // The derived input contract: every `$context` key the stored def binds,
  // typed from the schema by its position. Computed, never authored.
  context?: ContextSignature;
  // Reads: the stored result shape. Mutations: what the write changes.
  shape?: unknown;
  effect?: MutationEffect[];
};

export type DiscoveryResponse = {
  vex: string;
  description: string;
  entities: DiscoveryEntity[];
  // Governance summary + the endpoint's known queries — self-description
  // an agent (or a management UI) can read before generating anything.
  protection: 'all' | 'some' | 'none';
  locked: boolean;
  fingerprints: DiscoveryFingerprint[];
  query: {
    method: string;
    accepts: string;
    body: Record<string, DiscoveryField>;
  };
  dsl: object;
};

type DiscoveryEntity = {
  name: string;
  fields: Array<{
    name: string;
    type: string;
    nullable: boolean;
    primaryKey: boolean;
  }>;
  relations: Array<{
    entity: string;
    type: string;
    via: string;
  }>;
  rowCount?: number;
};

type DiscoveryField = {
  type: string;
  required: boolean;
  description: string;
};
// (queryParams are gone — the request body carries all cache semantics.)

// ═══════════════════════════════════════════════════════════════
// Discovery
// ═══════════════════════════════════════════════════════════════

const filterSchema = (schema: DatabaseSchema | undefined, entities?: string[]): EntitySchema[] => {
  if (schema === undefined) return [];
  if (entities === undefined || entities.length === 0) return schema.entities;
  return schema.entities.filter(e => entities.includes(e.name));
};

// ─── Visibility under a policy — discovery advertises only what the
// policy can touch. These mirror the ENFORCEMENT semantics (applyScope /
// scopeMutation) as pure predicates: a phase exists, is public, or falls
// to the default. Enforcement still runs on every request; this only
// keeps the catalog honest per principal. ───────────────────────
const canReadTable = (policy: ScopePolicy, table: string): boolean => {
  const rule = policy.entities[table];
  if (rule === undefined) return policy.default === 'allow';
  if ('public' in rule) return true;
  if ('deny' in rule) return false;
  return rule.read !== undefined || policy.default === 'allow';
};

const canWriteTable = (policy: ScopePolicy, table: string, op: string): boolean => {
  const rule = policy.entities[table];
  if (rule === undefined) return policy.default === 'allow';
  if ('public' in rule) return true;
  if ('deny' in rule) return false;
  if (rule.write !== undefined || policy.default === 'allow') return true;
  // insertEach is an insert that happens N times — same phase.
  if (op === 'insert' || op === 'insertEach') return rule.insert !== undefined;
  if (op === 'update') return rule.update !== undefined;
  if (op === 'delete') return rule.delete !== undefined;
  // upsert desugars to insert or update per call — advertise if either exists
  if (op === 'upsert') return rule.insert !== undefined || rule.update !== undefined;
  return false;
};

// Every table a read touches — string sources, recursing into subquery
// sources (`{ as, query }`).
const collectTables = (dsl: Query): string[] => {
  const out: string[] = [];
  const walk = (q: Query): void => {
    for (const src of q.from) {
      if (typeof src === 'string') out.push(src);
      else walk(src.query);
    }
  };
  walk(dsl);
  return out;
};

const entryVisible = (policy: ScopePolicy, entry: CacheEntry): boolean => {
  if (entry.kind === 'ok') return collectTables(entry.dsl).every((t) => canReadTable(policy, t));
  if (entry.kind === 'mutation') return mutationEffect(entry.mutation).every((e) => canWriteTable(policy, e.table, e.op));
  return false;
};

const listFingerprints = async (engine: QueryEngine, policy?: ScopePolicy): Promise<DiscoveryFingerprint[]> => {
  if (engine.cache.entries === undefined) return [];
  const schema = engine.getSchema();
  const current = schema !== undefined ? computeSchemaFingerprint(schema) : undefined;
  const rows = await engine.cache.entries();
  return rows
    .filter(({ key, entry }) => (entry.kind === 'ok' || entry.kind === 'mutation') && !key.startsWith('neg:'))
    .filter(({ entry }) => policy === undefined || entryVisible(policy, entry))
    .map(({ key, entry }) => ({
      fingerprint: key,
      kind: entry.kind === 'mutation' ? ('mutation' as const) : ('query' as const),
      protected: entry.protected === true,
      schemaFresh: isEntryFresh(entry, current),
      ...(entry.intent !== undefined ? { intent: entry.intent } : {}),
      createdAt: entry.createdAt,
      ...(entry.lastUsedAt !== undefined ? { lastUsedAt: entry.lastUsedAt } : {}),
      // The derived contract — what to pass, straight from the stored def.
      ...(entry.kind === 'ok'
        ? {
            context: collectQueryContext(entry.dsl, schema),
            ...(entry.shape !== undefined ? { shape: entry.shape } : {}),
          }
        : entry.kind === 'mutation'
          ? {
              context: collectMutationContext(entry.mutation, schema),
              effect: mutationEffect(entry.mutation),
            }
          : {}),
    }));
};

export const handleDiscovery = async (config: VexHandlerConfig): Promise<DiscoveryResponse> => {
  const { engine, entities: entityFilter, scopePolicy } = config;
  // Under a scopePolicy, discovery is per-principal: entities and entries
  // the policy cannot touch are not advertised (what you can't reach
  // doesn't exist for you — deny by absence, in the catalog too).
  const filtered = filterSchema(engine.getSchema(), entityFilter).filter(
    (e) => scopePolicy === undefined || canReadTable(scopePolicy, e.name),
  );
  const fingerprints = await listFingerprints(engine, scopePolicy);
  const protectedCount = fingerprints.filter((f) => f.protected).length;

  return {
    protection: protectedCount === 0 ? 'none' : protectedCount === fingerprints.length ? 'all' : 'some',
    locked: config.locked === true,
    fingerprints,
    vex: '1.0',
    description: 'Query this resource using natural language or structured DSL',
    entities: filtered.map(e => ({
      name: e.name,
      fields: e.fields.map(f => ({
        name: f.name,
        type: f.normalizedType,
        nullable: f.nullable,
        primaryKey: f.primaryKey,
      })),
      relations: e.relations.map(r => ({
        entity: r.entity,
        type: r.type,
        via: r.localField,
      })),
      rowCount: e.rowCount,
    })),
    query: {
      method: 'POST',
      accepts: 'application/json',
      body: {
        fingerprint: {
          type: 'string',
          required: false,
          description:
            'Cache identity. Alone → replay a known query (no generation). With intent+shape → a named slot: ' +
            'matching request hits, differing request regenerates and replaces (409 when protected). ' +
            'Omitted → generate fresh; the minted fingerprint returns in meta.cache.fingerprint.',
        },
        intent: {
          type: 'string',
          required: false,
          description: 'Natural language description of what data you need',
        },
        shape: {
          type: 'any',
          required: false,
          description: 'Example of the response structure — use empty strings, zeros, booleans as type indicators. Required unless replaying by fingerprint.',
        },
        context: {
          type: 'Record<string, unknown>',
          required: false,
          description: 'Runtime parameters referenced in filters as { $context: "key" }',
        },
      },
    },
    dsl: z.toJSONSchema(QuerySchema, { target: 'draft-7', reused: 'ref' }),
  };
};

// ═══════════════════════════════════════════════════════════════
// Query execution
// ═══════════════════════════════════════════════════════════════

export type QueryResult = {
  status: number;
  body: unknown;
};

// Rows an execution touched, for the observer's `rows` — an array's length, a
// single object as one, nothing as zero. Never inspects the values.
const rowsOf = (result: unknown): number =>
  Array.isArray(result) ? result.length : result === null || result === undefined ? 0 : 1;

export const handleQuery = async (
  config: VexHandlerConfig,
  body: unknown,
  scope: ScopeValues,
): Promise<QueryResult> => {
  // Unobserved: the fast path builds no probe, takes no timestamps, allocates
  // no record. An endpoint with no telemetry pays exactly nothing.
  if (config.onExecute === undefined) return runQuery(config, body, scope, undefined);

  const startUnixNano = Date.now() * 1e6;
  const t0 = elapsedClock();
  const probe: ExecuteProbe = { kind: 'query' };
  const result = await runQuery(config, body, scope, probe);
  const record: ExecuteRecord = {
    kind: probe.kind,
    // 200 succeeded; 403 is a policy/reach refusal (a normal outcome, not a
    // fault); everything else is an error.
    status: result.status === 200 ? 'ok' : result.status === 403 ? 'refused' : 'error',
    startUnixNano,
    endUnixNano: startUnixNano + (elapsedClock() - t0) * 1e6,
    scope,
    ...(probe.fingerprint !== undefined ? { fingerprint: probe.fingerprint } : {}),
    ...(probe.reach !== undefined ? { reach: probe.reach } : {}),
    ...(probe.cacheHit !== undefined ? { cacheHit: probe.cacheHit } : {}),
    ...(probe.rows !== undefined ? { rows: probe.rows } : {}),
  };
  try {
    config.onExecute(record);
  } catch (err) {
    console.error('[vex:onExecute]', err);
  }
  return result;
};

// Sub-millisecond monotonic reading in milliseconds. `performance` is present
// on every runtime vex targets; the wall clock is the fallback that keeps the
// duration honest (0) rather than throwing where it is not.
const elapsedClock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const runQuery = async (
  config: VexHandlerConfig,
  body: unknown,
  scope: ScopeValues,
  probe: ExecuteProbe | undefined,
): Promise<QueryResult> => {
  const { engine } = config;

  const parsed = QueryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      status: 400,
      body: {
        error: 'invalid_request',
        message: parsed.error.message,
      },
    };
  }

  const hasShape = parsed.data.shape !== undefined && parsed.data.shape !== null;
  if (!hasShape && parsed.data.fingerprint === undefined) {
    return {
      status: 400,
      body: {
        error: 'invalid_request',
        message: 'Pass a fingerprint (replay) or intent + shape (generate) — or both (named slot).',
      },
    };
  }

  // Recorded before anything can refuse, so a refusal span still carries the
  // fingerprint it refused. A read that mints one overwrites this from meta.
  if (probe !== undefined && parsed.data.fingerprint !== undefined) probe.fingerprint = parsed.data.fingerprint;

  try {
    // ONE wire shape: `{ fingerprint, context }`. The entry's kind decides
    // the pipeline — a mutation fingerprint replays the write path; anything
    // else is the read path (which owns misses, generation, and locked).
    let entryReach: string | undefined;
    if (parsed.data.fingerprint !== undefined) {
      const entry = await engine.cache.get(parsed.data.fingerprint);
      if (entry !== undefined && entry.kind === 'ok') entryReach = entry.reach;
      if (probe !== undefined && entryReach !== undefined) probe.reach = entryReach;
      if (entry !== undefined && entry.kind === 'mutation') {
        if (probe !== undefined) {
          probe.kind = 'mutation';
          if (entry.reach !== undefined) probe.reach = entry.reach;
        }
        if (config.mutations === undefined) {
          return {
            status: 500,
            body: { error: 'execution_error', message: 'This endpoint serves no mutations — handler has no mutation client configured.' },
          };
        }
        const schema = engine.getSchema();
        if (schema === undefined) {
          return { status: 500, body: { error: 'execution_error', message: 'Vex schema not introspected.' } };
        }
        // A WRITE MAY DEMAND A NARROWER REACH TOO, and the stakes are higher
        // than for a read: too wide here changes somebody else's row rather
        // than merely showing it.
        let writePolicy = config.mutations.policy;
        if (entry.reach !== undefined) {
          if (config.policyForReach === undefined) {
            return {
              status: 500,
              body: {
                error: 'execution_error',
                message: `Entry "${parsed.data.fingerprint ?? ''}" requires reach "${entry.reach}" and this handler has no policyForReach.`,
              },
            };
          }
          const narrowed = await config.policyForReach(entry.reach);
          if (narrowed === undefined) {
            return {
              status: 403,
              body: { error: 'scope_denied', message: `Reach "${entry.reach}" is not available to this principal.` },
            };
          }
          writePolicy = narrowed;
        }

        const writes = await executeWrites(config.mutations.client, entry.mutation, {
          context: parsed.data.context,
          scope,
          policy: writePolicy,
          schema,
        });
        const rows = writes.flatMap((w) => w.rows);
        // The commit happened; the observer hears about it now, and its
        // failure is its own — the response must tell the truth about a
        // write that already landed.
        if (config.mutations.onWrite !== undefined) {
          try {
            config.mutations.onWrite({ fingerprint: parsed.data.fingerprint, writes, scope });
          } catch (err) {
            console.error('[vex:onWrite]', err);
          }
        }
        // Lifetime = usage, for writes exactly as for reads: stamp
        // lastUsedAt (off the hot path) so the GC sweep sees replays.
        fireAndForget(engine.cache.set(parsed.data.fingerprint, { ...entry, lastUsedAt: Date.now() }));
        if (probe !== undefined) probe.rows = rows.length;
        // A single statement returns its one affected row; a batch returns
        // the array — the same `{ result }` envelope a query reply uses.
        return { status: 200, body: { result: rows.length === 1 ? rows[0] : rows } };
      }
    }

    // AN ENTRY MAY REQUIRE A NARROWER REACH THAN ITS CALLER HAS.
    //
    // "The classes you have booked" means the caller's own, and a principal
    // holding two roles reaches as wide as either grants. So the entry names
    // the profile it must be served at and the host recompiles the same grants
    // under it — narrowing rows, never widening verbs.
    //
    // Fail closed: a declared reach the host cannot compile refuses the read.
    // Serving it at the caller's own reach is the exact failure the field
    // exists to prevent, and it would be invisible.
    let readPolicy = config.scopePolicy;
    if (entryReach !== undefined) {
      if (config.policyForReach === undefined) {
        return {
          status: 500,
          body: {
            error: 'execution_error',
            message: `Entry "${parsed.data.fingerprint ?? ''}" requires reach "${entryReach}" and this handler has no policyForReach.`,
          },
        };
      }
      readPolicy = await config.policyForReach(entryReach);
      if (readPolicy === undefined) {
        return {
          status: 403,
          body: { error: 'scope_denied', message: `Reach "${entryReach}" is not available to this principal.` },
        };
      }
    }

    const response = await engine.execute(parsed.data, {
      scope,
      entities: config.entities,
      ...(config.locked === true ? { locked: true } : {}),
      ...(readPolicy !== undefined ? { scopePolicy: readPolicy } : {}),
    });
    if (probe !== undefined) {
      probe.cacheHit = response.meta.cache.hit;
      // The identity actually served — the caller's replay key, or the one just
      // minted for a miss.
      if (response.meta.cache.fingerprint !== undefined) probe.fingerprint = response.meta.cache.fingerprint;
      probe.rows = rowsOf(response.result);
    }
    return { status: 200, body: response };
  } catch (err) {
    if (err instanceof VexError) {
      const status = err.code === 'fingerprint_protected' ? 409 : err.code === 'cache_miss' ? 404 : 400;
      return {
        status,
        body: {
          error: err.code,
          message: err.message,
          details: err.details,
        },
      };
    }
    console.error('[vex] unhandled error:', err);
    const errObj = err as Record<string, unknown> | null;
    const message = err instanceof Error
      ? err.message
      : (typeof errObj?.message === 'string' ? errObj.message : 'Unknown error');
    const code = typeof errObj?.code === 'string' ? errObj.code : 'execution_error';
    return {
      status: 500,
      body: { error: code, message },
    };
  }
};

// ═══════════════════════════════════════════════════════════════
// Fingerprint management — protect (PATCH) and evict (DELETE).
// The ONLY writers of the `protected` bit besides the seed path.
// ═══════════════════════════════════════════════════════════════

export const handleFingerprintPatch = async (
  config: VexHandlerConfig,
  fingerprint: string,
  patch: { protected?: boolean },
): Promise<QueryResult> => {
  if (config.locked === true) {
    return { status: 403, body: { error: 'locked', message: 'This endpoint is locked — fingerprints cannot be managed here.' } };
  }
  const entry = await config.engine.cache.get(fingerprint);
  if (entry === undefined || (entry.kind !== 'ok' && entry.kind !== 'mutation')) {
    return { status: 404, body: { error: 'cache_miss', message: `Unknown fingerprint "${fingerprint}"` } };
  }
  if (typeof patch.protected !== 'boolean') {
    return { status: 400, body: { error: 'invalid_request', message: 'Body must be { protected: boolean }' } };
  }
  await config.engine.cache.set(fingerprint, { ...entry, protected: patch.protected });
  return { status: 200, body: { fingerprint, protected: patch.protected } };
};

export const handleFingerprintDelete = async (
  config: VexHandlerConfig,
  fingerprint: string,
): Promise<QueryResult> => {
  if (config.locked === true) {
    return { status: 403, body: { error: 'locked', message: 'This endpoint is locked — fingerprints cannot be managed here.' } };
  }
  const entry = await config.engine.cache.get(fingerprint);
  if (entry === undefined) {
    return { status: 404, body: { error: 'cache_miss', message: `Unknown fingerprint "${fingerprint}"` } };
  }
  if (entry.kind === 'ok' && entry.protected === true) {
    return { status: 409, body: { error: 'fingerprint_protected', message: `"${fingerprint}" is protected — unprotect it first.` } };
  }
  await config.engine.cache.delete(fingerprint);
  return { status: 200, body: { fingerprint, deleted: true } };
};
