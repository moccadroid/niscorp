// The FULL architect, with a real LLM. Designs a view from a description, then
// independently confirms it mounts + loads. This is the first end-to-end proof
// that the agent actually authors a working action (the harness check proves the
// scaffolding; this proves the agent).
//
// Needs a Groq key:  GROQ_API_KEY=sk-... pnpm --filter relay architect
// Node has no localStorage, so we shim one BEFORE anything reads it — both Ray's
// key store and Vex's cache-miss LLM read the key through it.

const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string): string | null => store.get(k) ?? null,
    setItem: (k: string, v: string): void => void store.set(k, v),
    removeItem: (k: string): void => void store.delete(k),
  },
};

import type { CortexEvent } from '@niscorp/cortex';
import { setKey, createLlmClient } from '../llm';
import { runActionArchitect } from '../ray/architect';
import { runAction } from '../ray/architect/harness';

const INTENT =
  'A table of the top 10 open deals by value, showing company, stage, value and close date. Click a row to open that deal.';

const main = async (): Promise<void> => {
  const key = process.env['GROQ_API_KEY'];
  if (key === undefined || key === '') {
    console.error('Set GROQ_API_KEY to run this check.');
    process.exit(2);
  }
  setKey(key); // so Vex's cache-miss query agent can read it too
  const llm = createLlmClient(key);

  // Live trace of the architect's run — typed events, no casting.
  const trace = (event: CortexEvent): void => {
    if (event.type === 'tool-end') {
      const o = event.observation;
      console.log(`  · ${o.toolId} ${o.kind === 'result' ? 'ok' : `ERR ${o.kind === 'error' ? o.error : o.kind}`}`);
    }
    if (event.type === 'retry') console.log(`  · retry(${event.kind}): ${event.issues}`);
  };

  console.log(`Intent: ${INTENT}\nBuilding (watch the architect work)…`);
  // Headless check runs both roles on the same client (one key in this harness).
  const built = await runActionArchitect(llm, llm, INTENT, { onEvent: trace });
  if (!built.ok) {
    console.error(`\n✗ build failed: ${built.error}${built.issues ? `\n  issues: ${built.issues.join('; ')}` : ''}`);
    process.exit(1);
  }
  console.log(`\n✓ built "${built.action.id}" — ${built.reasoning ?? ''}`);

  // Independently mount it — the same gate the Ray tool uses before placing it.
  const run = await runAction(built.action);
  const keys = Object.keys(run.data);
  const firstArray = keys.map((k) => run.data[k]).find(Array.isArray) as unknown[] | undefined;
  console.log(`✓ mounts clean: ${run.ok} (issues: ${run.issues.length}${run.issues.length ? ' — ' + run.issues.join('; ') : ''})`);
  console.log(`  data keys: ${keys.join(', ')}`);
  console.log(`  loaded rows: ${firstArray ? `${firstArray.length} (sample ${JSON.stringify(firstArray[0])})` : 'none'}`);
  console.log(`\n--- generated action ---\n${JSON.stringify(built.action, null, 2)}`);
  process.exit(run.ok ? 0 : 1);
};

void main();
