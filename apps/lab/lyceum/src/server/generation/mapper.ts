import type { SignalClient } from '@niscorp/cortex';
import { compile, execute } from '@niscorp/prism';
import type { JsonObject } from '@niscorp/prism';
import type { MapToShape } from '@niscorp/vex';
import { createShapeMapper, rowsFitShape } from '@niscorp/vex/agent';
import type { Tracer } from './trace';

// Vex's own mapper; the trace learns whether it called the model.
export const watchedShapeMapper = ({ llm, tracer }: { llm: SignalClient; tracer: Tracer }): MapToShape => {
  return async (rows, shape, intent) => {
    let byAgent = false;
    const watched: SignalClient = {
      ...llm,
      step: (request) => {
        byAgent = true;
        return llm.step(request);
      },
      stepStream: (request, options) => {
        byAgent = true;
        return llm.stepStream(request, options);
      },
    };
    const at = Date.now();
    const mapped = await createShapeMapper(watched)(rows, shape, intent);
    tracer.mapped({ byAgent, ms: byAgent ? Date.now() - at : 0 });
    return mapped;
  };
};

const IDENTITY = { $ref: '$.result' };

// The checks' stand-in: rows that fit their shape replay as they are, and any
// others get the one mapping it is handed, at a model's pace.
export const standInShapeMapper = ({ mapping, paceMs, tracer }: { mapping: unknown; paceMs: number; tracer: Tracer }): MapToShape => {
  return async (rows, shape) => {
    const envelope = { result: Array.isArray(shape) ? rows : (rows[0] ?? null) } as unknown as JsonObject;
    const fits = rowsFitShape(rows, shape);
    if (!fits) await new Promise((resolve) => setTimeout(resolve, paceMs));
    tracer.mapped({ byAgent: !fits, ms: fits ? 0 : paceMs });
    const config = fits ? IDENTITY : mapping;
    const ir = await compile(config);
    return { ir, config, transformed: execute(ir, envelope) };
  };
};
