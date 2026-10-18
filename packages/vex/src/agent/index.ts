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
  return async (request, schema, caller) => {
    const tools = createQueryTools({ getSchema: () => schema, read: caller.read });

    const agentInput = {
      intent: request.intent,
      shape: request.shape,
      contextKeys: Object.keys(request.context),
    };

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

export const createShapeMapper = (llm: SignalClient): MapToShape => {
  return async (rows, shape, intent) => {
    // `result` must match the envelope engine/runtime.ts replays the IR against.
    const single = !Array.isArray(shape);
    const envelope = { result: single ? (rows[0] ?? null) : rows } as unknown as JsonObject;

    const result = await mappingAgent.run(
      { sampleInput: envelope, targetShape: shape, ...(intent !== undefined ? { notes: `The request these rows answer: ${intent}` } : {}) },
      { llm },
    ).result;

    if (!result.ok) throw new VexError('agent_failed', `${result.error.code}: ${result.error.message}`);

    const config = result.output.data;
    const ir = await compile(config);
    const transformed = execute(ir, envelope);
    return { ir, config, transformed };
  };
};
