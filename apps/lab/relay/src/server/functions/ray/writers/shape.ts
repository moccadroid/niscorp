import { compile, execute, type JsonObject } from '@niscorp/prism';
import type { MapToShape } from '@niscorp/vex';
import { createShapeMapper } from '@niscorp/vex/agent';
import type { SignalClient } from '@niscorp/cortex';
import { declaredMapping } from './declared';

// Rows into the shape a request asked for. A flat shape whose plain fields the rows carry is mapped by prism from the
// shape itself; any other is left to vex's mapping agent.
export const shapeWriter = (llm: SignalClient): MapToShape => {
  const agent = createShapeMapper(llm);
  return async (rows, shape, intent) => {
    const mapping = declaredMapping(shape);
    const first = rows[0];
    if (mapping === undefined || (first !== undefined && mapping.reads.some((field) => !(field in first)))) return agent(rows, shape, intent);
    const ir = await compile(mapping.config);
    const envelope = { result: Array.isArray(shape) ? rows : (first ?? null) } as unknown as JsonObject;
    return { ir, config: mapping.config, transformed: execute(ir, envelope) };
  };
};
