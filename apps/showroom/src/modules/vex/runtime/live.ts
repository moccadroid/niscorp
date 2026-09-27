import { createSignal } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import { createQueryDsl, createShapeMapper } from '@niscorp/vex/agent';
import type { DatabaseSchema, QueryEngineConfig } from '@niscorp/vex';
import { getKey } from '@showroom/modules/signal/settings/api-key-storage';
import { createOpenAIClient } from '@showroom/modules/signal/openai-client';
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
export const makeGenerateDsl = (queryJsonSchema: object): GenerateDsl => {
  return (request, schema: DatabaseSchema, caller) => {
    const generate = createQueryDsl({ llm: buildLlm(), queryJsonSchema });
    return generate({ ...request, shape: flattenShape(request.shape) }, schema, caller);
  };
};

// Engine-level hook: builds Prism's mapping agent on demand. Rows that
// already are the shape skip it — vex's mapper returns the identity for
// them without a model call (vex/agent rowsFitShape).
export const makeMapToShape = (): MapToShape => {
  return async (rows, shape) => createShapeMapper(buildLlm())(rows, shape);
};
