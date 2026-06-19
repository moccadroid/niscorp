import {
  defineAgent,
  runAgentStandalone,
  isOk,
  systemProducer,
  inputProducer,
  toolsProducer,
  historyProducer,
} from '@niscorp/cortex';
import type {
  Result,
  SignalClient,
  AgentDefinition,
  StandaloneOptions,
  Bus,
} from '@niscorp/cortex';
import { VexError } from '../errors.js';
import { mappingAgent } from '@niscorp/prism/agent';
import type { MappingAgentOutput } from '@niscorp/prism/agent';
import { compile, execute } from '@niscorp/prism';
import type { JsonObject, JsonValue } from '@niscorp/prism';
import { createQueryTools } from './tools.js';
import { createQueryProducers } from './producers.js';
import { queryRules } from './rules.js';
import { vexQueryDslAgent } from './query.agent.js';
import type { Query } from '../schemas/query.schema.js';
import type { DatabaseAdapter } from '../adapters/adapter.types.js';
import type { DatabaseSchema } from '../schemas/database.schema.js';
import type { ScopePolicy } from '../scope/scope.types.js';
import type { GenerateDsl, MapToShape } from '../types.js';

// ═══════════════════════════════════════════════════════════════
// Re-exports
// ═══════════════════════════════════════════════════════════════

export { vexQueryDslAgent } from './query.agent.js';
export { createQueryTools } from './tools.js';
export type { QueryToolDeps } from './tools.js';
export { queryRules } from './rules.js';
export { createQueryProducers } from './producers.js';
export type { ProducerDeps, ContextProducer, ContentChunk, BuildContext } from './producers.js';

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

export const createQueryDsl = (config: QueryDslConfig): GenerateDsl => {
  return async (request, schema) => {
    const tools = createQueryTools({
      getSchema: () => schema,
      adapter: config.adapter,
      scopePolicy: config.scopePolicy,
    });

    const systemPrompt = [
      vexQueryDslAgent.config.instructions,
      '',
      'Database schema:',
      JSON.stringify(schema),
      '',
      'DSL specification (JSON Schema):',
      JSON.stringify(config.queryJsonSchema),
    ].join('\n');

    const agentWithContext: AgentDefinition<Query> = defineAgent<Query>({
      ...vexQueryDslAgent.config,
      context: {
        producers: [
          systemProducer(systemPrompt),
          toolsProducer(),
          historyProducer(),
          inputProducer(),
        ],
      },
    });

    const agentInput = {
      intent: request.intent,
      shape: request.shape,
      contextKeys: Object.keys(request.context),
    };

    // The agent signals "cannot satisfy" by emitting on the bus (which
    // also trips an abort rule). The abort surfaces as a generic error,
    // so we capture the reason here to distinguish a real unsatisfiable
    // result (worth negative-caching) from a transient failure.
    let unsatisfiableReason: string | undefined;

    const result: Result<Query> = await runAgentStandalone(agentWithContext, agentInput, {
      llm: config.llm,
      tools,
      onBus: (bus: Bus) => {
        bus.on('vex.unsatisfiable', (event) => {
          const payload = event.payload as { reason?: unknown } | undefined;
          if (payload && typeof payload.reason === 'string') unsatisfiableReason = payload.reason;
        });
      },
    });

    if (!isOk(result)) {
      if (unsatisfiableReason !== undefined) {
        throw new VexError('unsatisfiable', unsatisfiableReason);
      }
      throw result.error;
    }
    return result.data;
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

    const result: Result<MappingAgentOutput> = await runAgentStandalone(
      mappingAgent,
      { sampleInput: envelope, targetShape: shape },
      { llm },
    );

    if (!isOk(result)) throw result.error;

    const ir = await compile(result.data.config);
    const transformed = execute(ir, envelope);
    return { ir, transformed };
  };
};
