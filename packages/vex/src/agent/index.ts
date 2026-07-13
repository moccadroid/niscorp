import type { RunHandle } from '@niscorp/cortex';
import { VexError } from '../errors.js';
import { mappingAgent } from '@niscorp/prism/agent';
import { compile, execute } from '@niscorp/prism';
import type { JsonObject } from '@niscorp/prism';
import { createQueryTools } from './tools.js';
import { vexQueryDslAgent } from './query.agent.js';
import type { Query } from '../schemas/query.schema.js';
import type { DatabaseAdapter } from '../adapters/adapter.types.js';
import type { DatabaseSchema } from '../schemas/database.schema.js';
import type { ScopePolicy } from '../scope/scope.types.js';
import type { GenerateDsl, MapToShape } from '../types.js';
import type { SignalClient } from '@niscorp/cortex';

// ═══════════════════════════════════════════════════════════════
// Re-exports
// ═══════════════════════════════════════════════════════════════

export { vexQueryDslAgent } from './query.agent.js';
export type { VexQueryDeps } from './query.agent.js';
export { createQueryTools } from './tools.js';
export type { QueryToolDeps } from './tools.js';

// ═══════════════════════════════════════════════════════════════
// generateDsl hook factory — runs vexQueryDslAgent
// ═══════════════════════════════════════════════════════════════

export type QueryDslConfig = {
  adapter: DatabaseAdapter;
  llm: SignalClient;
  scopePolicy?: ScopePolicy;
  schema: DatabaseSchema;
  queryJsonSchema: object;
};

const reasonFrom = (args: unknown): string | undefined => {
  if (typeof args !== 'object' || args === null) return undefined;
  const reason = (args as Record<string, unknown>)['reason'];
  return typeof reason === 'string' ? reason : undefined;
};

export const createQueryDsl = (config: QueryDslConfig): GenerateDsl => {
  return async (request, schema) => {
    const tools = createQueryTools({
      getSchema: () => schema,
      adapter: config.adapter,
      ...(config.scopePolicy && { scopePolicy: config.scopePolicy }),
    });

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
// The mapping runs ONCE over the whole row set as { result: rows }, and its
// output IS the result (array / object / scalar). The { result: rows } envelope
// here must match the runtime's cache-hit path (engine/runtime.ts), which
// replays the cached IR against the same envelope. Keep them in lockstep.
//
// NOTE: for the agent to actually author a whole-set mapping (a `$map` over
// `$.result` for arrays), its instructions must teach that — tracked as a
// follow-up. Canned/relay paths use a hand-authored, seeded IR and are correct
// today; this affects only live generation.
// ═══════════════════════════════════════════════════════════════

export const createShapeMapper = (llm: SignalClient): MapToShape => {
  return async (rows, shape) => {
    // Array shape → map the whole set; a non-array shape → map the single
    // (first) row. The envelope here must match the runtime's (engine/runtime.ts).
    const single = !Array.isArray(shape);
    const envelope = { result: single ? (rows[0] ?? null) : rows } as unknown as JsonObject;

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
