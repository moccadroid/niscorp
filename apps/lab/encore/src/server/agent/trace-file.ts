import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type RunTrace = {
  runId: string;
  at: string;
  principal: string | null;
  model: string;
  status: string;
  prompt: unknown;
  tools: string[];
  events: unknown[];
  rawReply: string[];
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
