import type { SignalClient } from '@niscorp/cortex';
import { compile, execute } from '@niscorp/prism';
import type { JsonObject } from '@niscorp/prism';
import { mappingAgent } from '@niscorp/prism/agent';
import { VexError } from '@niscorp/vex';
import type { MapToShape } from '@niscorp/vex';
import { rowsFitShape } from '@niscorp/vex/agent';
import type { Tracer } from './trace';

// THE SHAPE MAPPER, WATCHED. Vex's own (`createShapeMapper`) decides whether
// the rows are already the shape and, when they are not, runs the mapping
// agent — and keeps which it was to itself. This is the same hook — the same
// test for a fit, the same agent, the same envelope — that also tells the
// trace which it was: the identity with no model, or a mapping the agent
// wrote. Nothing about how rows are mapped changes.

// The identity mapping over the envelope — what a fitting row set replays as.
const IDENTITY = { $ref: '$.result' };

// Who writes a mapping for rows that are not the shape: the mapping agent, or
// the checks' stand-in for it.
export type WriteMapping = (sample: JsonObject, shape: unknown) => Promise<unknown>;

export const agentMapping =
  (llm: SignalClient): WriteMapping =>
  async (sample, shape) => {
    const result = await mappingAgent.run({ sampleInput: sample, targetShape: shape }, { llm }).result;
    if (!result.ok) throw new VexError('agent_failed', `${result.error.code}: ${result.error.message}`);
    return result.output.data;
  };

export const watchedShapeMapper = ({ write, tracer }: { write: WriteMapping; tracer: Tracer }): MapToShape => {
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
    const written = await write(envelope, shape);
    tracer.mapped({ byAgent: true, ms: Date.now() - at });

    const ir = await compile(written);
    return { ir, transformed: execute(ir, envelope) };
  };
};
