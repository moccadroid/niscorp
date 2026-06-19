import { createSignal } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import { createQueryDsl, createShapeMapper } from '@niscorp/vex/agent';
import type { DatabaseAdapter, DatabaseSchema, QueryEngineConfig, Row } from '@niscorp/vex';
import { compile } from '@niscorp/prism';
import type { JsonValue } from '@niscorp/prism';
import { getKey } from '@showroom/modules/signal/settings/api-key-storage';
import { createOpenAIClient } from '@showroom/modules/signal/openai-client';
import { scopePolicy } from './scope';
import { getLiveConfig } from './live-config';
import { wrapForDebug } from './live-debug';

// ═══════════════════════════════════════════════════════════
// Live mode — turns a stored provider key into the engine's
// generateDsl / mapToShape hooks using @niscorp/vex/agent (the same
// reference agents the dev server wires). Provider + model come from
// live-config (UI-driven, persisted). Hooks are built lazily per call
// so a key/model change takes effect without a reboot, and so canned
// (cache-hit) runs never touch any of this.
// ═══════════════════════════════════════════════════════════

export { hasGenerationKey, availableProviders } from './live-config';

type GenerateDsl = NonNullable<QueryEngineConfig['generateDsl']>;
type MapToShape = NonNullable<QueryEngineConfig['mapToShape']>;

const buildLlm = (): SignalClient => {
  const { provider, model } = getLiveConfig();
  const key = getKey(provider);
  if (key === undefined) {
    throw new Error(
      `Live generation needs a ${provider} key. Set one in Signal → Settings to type your own intents.`,
    );
  }
  const client = createOpenAIClient(provider, key);
  const base = createSignal(provider, { client }).apiKey(key).model(model);
  return wrapForDebug(base, `${provider}/${model}`);
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

// The query agent only emits flat `entity.field` selections and rejects
// (cannotSatisfy) a shape that nests objects. Nesting is the mapper's
// job, so for GENERATION we hand the agent a flattened shape (leaf keys
// only); the engine still passes the original nested shape to mapToShape.
const flattenShape = (shape: unknown): unknown => {
  const flattenObj = (obj: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (isPlainObject(v)) Object.assign(out, flattenObj(v));
      else if (Array.isArray(v) && isPlainObject(v[0])) Object.assign(out, flattenObj(v[0]));
      else out[k] = v;
    }
    return out;
  };
  if (Array.isArray(shape)) return isPlainObject(shape[0]) ? [flattenObj(shape[0])] : shape;
  return isPlainObject(shape) ? flattenObj(shape) : shape;
};

// Engine-level hook: builds the real Cortex query agent on demand.
export const makeGenerateDsl = (
  adapter: DatabaseAdapter,
  queryJsonSchema: object,
): GenerateDsl => {
  return (request, schema: DatabaseSchema) => {
    const generate = createQueryDsl({
      adapter,
      llm: buildLlm(),
      scopePolicy,
      schema,
      queryJsonSchema,
    });
    return generate({ ...request, shape: flattenShape(request.shape) }, schema);
  };
};

// Identity is valid ONLY when the row's keys match the shape's keys
// exactly — same set, nothing extra, nothing missing — and the shape is
// flat. Anything else (extra columns, missing fields, a nested object)
// needs the real mapper to produce precisely the requested shape.
const rowsSatisfyShape = (rows: Row[], shape: unknown): boolean => {
  const target = Array.isArray(shape) ? shape[0] : shape;
  if (!isPlainObject(target)) return false;
  const first = rows[0];
  if (first === undefined) return true; // nothing to map
  if (!isPlainObject(first)) return false;
  const shapeKeys = Object.keys(target);
  const rowKeys = Object.keys(first);
  if (shapeKeys.length !== rowKeys.length) return false;
  for (const k of shapeKeys) {
    if (!(k in first)) return false;
    if (isPlainObject(target[k])) return false; // nested → real mapping required
  }
  return true;
};

// Engine-level hook: builds Prism's mapping agent on demand. Skips the
// LLM with an identity transform only when the rows already match the
// shape exactly.
export const makeMapToShape = (): MapToShape => {
  return async (rows, shape) => {
    if (rowsSatisfyShape(rows, shape)) {
      // Identity over the whole set: `$.result` is the rows array → returned
      // unchanged. Matches the runtime replaying this IR over { result: rows }.
      const ir = await compile({ $ref: '$.result' });
      return { ir, transformed: rows as unknown as JsonValue };
    }
    return createShapeMapper(buildLlm())(rows, shape);
  };
};
