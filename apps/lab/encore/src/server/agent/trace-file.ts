import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// ONE JSON FILE PER RUN, when ENCORE_TRACE_DIR is set: the assembled prompt,
// every event, the raw reply. It is how every bug in the three apps this one
// was written after was found (DESIGN.md § The law, enforced) — a prompt is
// assembled from live state that has moved by the time anybody asks "why did it
// say that", and the only honest record of it is the one written while it ran.
//
// Off unless asked for: a trace carries whatever the operator's screen carried.
// A failure to write one is reported and swallowed — a full disk must not turn
// a landed answer into a failed run.

export type RunTrace = {
  runId: string;
  at: string;
  principal: string | null;
  mode: string;
  model: string;
  status: string;
  // The messages of the first request, exactly as cortex assembled them.
  prompt: unknown;
  tools: string[];
  // Every cortex event of the run, in order.
  events: unknown[];
  // What the model actually typed, per step, before anything parsed it.
  rawReply: string[];
  // The whole transcript as the run left it: prompt, tool turns, corrections.
  transcript: unknown;
  result: unknown;
};

export const traceDirFrom = (env: Record<string, string | undefined>): string | undefined => {
  const dir = env['ENCORE_TRACE_DIR'];
  return dir === undefined || dir.trim() === '' ? undefined : dir;
};

export const writeRunTrace = async (dir: string, trace: RunTrace): Promise<string | undefined> => {
  try {
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${trace.at.replace(/[:.]/g, '-')}-${trace.runId}.json`);
    await writeFile(file, JSON.stringify(trace, null, 2), 'utf8');
    return file;
  } catch (error) {
    console.error('[encore/agent] the run trace could not be written:', error);
    return undefined;
  }
};
