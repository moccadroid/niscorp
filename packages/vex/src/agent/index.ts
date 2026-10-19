import type { RunHandle } from '@niscorp/cortex';
import { VexError } from '../errors.js';
import { mappingAgent } from '@niscorp/prism/agent';
import { compile, execute } from '@niscorp/prism';
import type { JsonObject } from '@niscorp/prism';
import { createQueryTools } from './tools.js';
import { compactSchema, compactSpec } from './compact.js';
import { declaredMapping, storedShape } from './declared.js';
import { describeCaller, vexQueryDslAgent } from './query.agent.js';
import type { Query } from '../schemas/query.schema.js';
import type { GenerateDsl, MapToShape } from '../types.js';
import type { SignalClient } from '@niscorp/cortex';

export { vexQueryDslAgent, describeCaller } from './query.agent.js';
export type { VexQueryDeps } from './query.agent.js';
export { createQueryTools } from './tools.js';
export type { QueryToolDeps } from './tools.js';

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
  const dslSpec = compactSpec(config.queryJsonSchema);
  return async (request, schema, caller) => {
    const tools = createQueryTools({ getSchema: () => schema, read: caller.read });

    // A shape with declared fields asks only for the stored fields they read: they are computed after the query.
    const stored = storedShape(request.shape);
    const agentInput = {
      intent: stored.declared ? `${request.intent ?? ''}\nReturn the stored fields the shape names; how a field is shown is worked out from them after the query.` : request.intent,
      shape: stored.shape,
      contextKeys: Object.keys(request.context),
    };

    let unsatisfiableReason: string | undefined;
    let run: RunHandle<Query> | undefined;
    run = vexQueryDslAgent.run(agentInput, {
      llm: config.llm,
      deps: {
        schemaJson: compactSchema(schema),
        dslSpecJson: dslSpec,
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// No rows is not a fit: nothing proves the columns, and the identity IR is
// replayed later against rows that exist.
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

const MAPPING_ATTEMPTS = 3;

export const createShapeMapper = (llm: SignalClient): MapToShape => {
  return async (rows, shape, intent) => {
    // `result` must match the envelope engine/runtime.ts replays the IR against.
    const single = !Array.isArray(shape);
    const envelope = { result: single ? (rows[0] ?? null) : rows } as unknown as JsonObject;

    // A flat shape whose fields the rows carry is mapped by prism from the shape itself, declared fields computed
    // from the stored ones; the agent writes the mapping for any other.
    const declared = declaredMapping(shape);
    const first = rows[0];
    if (declared !== undefined && (first === undefined || declared.reads.every((field) => field in first))) {
      const ir = await compile(declared.config);
      return { ir, config: declared.config, transformed: execute(ir, envelope) };
    }

    let failed: string | undefined;
    for (let attempt = 1; attempt <= MAPPING_ATTEMPTS; attempt += 1) {
      const notes = [
        ...(intent !== undefined
          ? [`The request these rows answer: ${intent}. The rows already answer it: they are filtered, sorted and limited. Give each value the form the request names, and keep every row, in order.`]
          : []),
        ...(failed !== undefined ? [`Your last config failed on these rows: ${failed}. Write one that runs on them.`] : []),
      ].join('\n');
      const result = await mappingAgent.run({ sampleInput: envelope, targetShape: shape, ...(notes !== '' ? { notes } : {}) }, { llm }).result;
      if (!result.ok) throw new VexError('agent_failed', `${result.error.code}: ${result.error.message}`);
      const config = result.output.data;
      try {
        const ir = await compile(config);
        return { ir, config, transformed: execute(ir, envelope) };
      } catch (error) {
        failed = error instanceof Error ? error.message : String(error);
      }
    }
    throw new VexError('agent_failed', `the mapping did not run on the rows it was written for: ${failed ?? 'no reason given'}`);
  };
};
