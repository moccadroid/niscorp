import type { SignalClient } from '@niscorp/cortex';
import { compile, execute } from '@niscorp/prism';
import type { JsonObject } from '@niscorp/prism';
import { mappingAgent } from '@niscorp/prism/agent';
import { VexError } from '@niscorp/vex';
import type { MapToShape } from '@niscorp/vex';
import { rowsFitShape } from '@niscorp/vex/agent';
import type { Tracer } from './trace';

// THE SHAPE MAPPER, WATCHED. Vex's own (`createShapeMapper`) decides whether
// the rows are already the shape and, when they are not, runs Prism's mapping
// agent — and keeps which it was to itself. This is the same hook — the same
// test for a fit, the same agent, the same envelope — that also tells the
// trace which it was: the identity with no model, or a mapping the agent
// wrote. Nothing about how rows are mapped changes.

// The identity mapping over the envelope — what a fitting row set replays as.
const IDENTITY = { $ref: '$.result' };

export const watchedShapeMapper = ({ llm, tracer }: { llm: SignalClient; tracer: Tracer }): MapToShape => {
  return async (rows, shape) => {
    // Array shape → the whole set; a non-array shape → the single (first) row.
    const single = !Array.isArray(shape);
    const envelope = { result: single ? (rows[0] ?? null) : rows } as unknown as JsonObject;

    if (rowsFitShape(rows, shape)) {
      tracer.mapped({ byAgent: false, ms: 0 });
      const ir = await compile(IDENTITY);
      return { ir, transformed: execute(ir, envelope) };
    }

    const at = Date.now();
    const result = await mappingAgent.run({ sampleInput: envelope, targetShape: shape }, { llm }).result;
    if (!result.ok) throw new VexError('agent_failed', `${result.error.code}: ${result.error.message}`);
    tracer.mapped({ byAgent: true, ms: Date.now() - at });

    const ir = await compile(result.output.data);
    return { ir, transformed: execute(ir, envelope) };
  };
};
