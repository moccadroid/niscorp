import type { RunHandle } from '@niscorp/cortex';
import { VexError } from '../errors.js';
import { mappingAgent } from '@niscorp/prism/agent';
import { compile, execute } from '@niscorp/prism';
import type { JsonObject } from '@niscorp/prism';
import { createQueryTools } from './tools.js';
import { describeCaller, vexQueryDslAgent } from './query.agent.js';
import type { Query } from '../schemas/query.schema.js';
import type { GenerateDsl, MapToShape } from '../types.js';
import type { SignalClient } from '@niscorp/cortex';

// ═══════════════════════════════════════════════════════════════
// Re-exports
// ═══════════════════════════════════════════════════════════════

export { vexQueryDslAgent, describeCaller } from './query.agent.js';
export type { VexQueryDeps } from './query.agent.js';
export { createQueryTools } from './tools.js';
export type { QueryToolDeps } from './tools.js';

// ═══════════════════════════════════════════════════════════════
// generateDsl hook factory — runs vexQueryDslAgent
// ═══════════════════════════════════════════════════════════════

// What the agent is built from. Who it runs FOR is not here: the engine hands
// every generation its caller (a `read` capability under that caller's policy
// and scope) and the schema that caller may see, so one hook serves every
// principal and cannot be built with the wrong one baked in.
export type QueryDslConfig = {
  llm: SignalClient;
  queryJsonSchema: object;
};

const reasonFrom = (args: unknown): string | undefined => {
  if (typeof args !== 'object' || args === null) return undefined;
  const reason = (args as Record<string, unknown>)['reason'];
  return typeof reason === 'string' ? reason : undefined;
};

export const createQueryDsl = (config: QueryDslConfig): GenerateDsl => {
  return async (request, schema, caller) => {
    const tools = createQueryTools({ getSchema: () => schema, read: caller.read });

    const agentInput = {
      intent: request.intent,
      shape: request.shape,
      contextKeys: Object.keys(request.context),
    };

    // The agent signals "cannot satisfy" by calling its cannotSatisfy
    // tool. We watch the run's event stream for that observation,
    // capture the reason, and abort — distinguishing a real
    // unsatisfiable result (worth negative-caching) from a transient
    // failure.
    let unsatisfiableReason: string | undefined;
    let run: RunHandle<Query> | undefined;
    run = vexQueryDslAgent.run(agentInput, {
      llm: config.llm,
      deps: {
        schemaJson: JSON.stringify(schema),
        dslSpecJson: JSON.stringify(config.queryJsonSchema),
        caller: describeCaller(caller.bindings),
      },
      tools,
      onEvent: (event) => {
        if (
          event.type === 'tool-end' &&
          event.observation.kind === 'result' &&
          event.observation.toolId === 'cannotSatisfy'
        ) {
          unsatisfiableReason = reasonFrom(event.observation.args) ?? 'request cannot be satisfied';
          run?.abort();
        }
      },
    });

    const result = await run.result;
    if (!result.ok) {
      if (unsatisfiableReason !== undefined) {
        throw new VexError('unsatisfiable', unsatisfiableReason);
      }
      throw new VexError('agent_failed', `${result.error.code}: ${result.error.message}`);
    }
    return result.output.data;
  };
};

// ═══════════════════════════════════════════════════════════════
// mapToShape hook factory — runs Prism's mappingAgent
//
// The mapping runs ONCE over { result }, and its output IS the result (array /
// object / scalar). An array shape puts the rows in $.result; an object shape
// puts the single (first) row there. The envelope here must match the
// runtime's cache-hit path (engine/runtime.ts), which replays the cached IR against the same envelope. Keep them in lockstep.
//
// NOTE: for the agent to actually author a whole-set mapping (a `$map` over
// `$.result` for arrays), its instructions must teach that — tracked as a
// follow-up. Canned/relay paths use a hand-authored, seeded IR and are correct
// today; this affects only live generation.
// ═══════════════════════════════════════════════════════════════

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// ROWS THAT ARE ALREADY THE SHAPE need no mapping. True only when the shape is
// flat (every value a scalar example) and the first row has EXACTLY the
// shape's keys — nothing extra, nothing missing — each holding the kind of
// value the shape shows (or null). The query agent aliases its columns to a
// flat shape's keys for exactly this reason. Anything else — a nested shape, a
// renamed or extra column, a count that came back as text — goes to the
// mapping agent. No rows is not a fit: there is nothing to prove the columns
// by, and the IR minted here is replayed later against rows that exist.
export const rowsFitShape = (rows: readonly Record<string, unknown>[], shape: unknown): boolean => {
  const example = Array.isArray(shape) ? shape[0] : shape;
  const first = rows[0];
  if (!isPlainObject(example) || first === undefined) return false;
  const keys = Object.keys(example);
  if (keys.length !== Object.keys(first).length) return false;
  return keys.every((key) => {
    const sample = example[key];
    if (typeof sample === 'object' && sample !== null) return false;
    if (!(key in first)) return false;
    const value = first[key];
    return value === null || typeof value === typeof sample;
  });
};

// The identity mapping over the envelope — what a fitting row set replays as.
const IDENTITY = { $ref: '$.result' };

export const createShapeMapper = (llm: SignalClient): MapToShape => {
  return async (rows, shape) => {
    // Array shape → map the whole set; a non-array shape → map the single
    // (first) row. The envelope here must match the runtime's (engine/runtime.ts).
    const single = !Array.isArray(shape);
    const envelope = { result: single ? (rows[0] ?? null) : rows } as unknown as JsonObject;

    // Already the shape: the identity, with no model call.
    if (rowsFitShape(rows, shape)) {
      const ir = await compile(IDENTITY);
      return { ir, transformed: execute(ir, envelope) };
    }

    const result = await mappingAgent.run(
      { sampleInput: envelope, targetShape: shape },
      { llm },
    ).result;

    if (!result.ok) throw new VexError('agent_failed', `${result.error.code}: ${result.error.message}`);

    const ir = await compile(result.output.data);
    const transformed = execute(ir, envelope);
    return { ir, transformed };
  };
};
