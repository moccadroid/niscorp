try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}

import type { CortexEvent } from '@niscorp/cortex';
import { architectLlms, runActionArchitect } from '@relay/server/functions/ray/architect';
import { runAction } from '@relay/server/functions/ray/architect/harness';
import { devRayContext } from './engine';

const INTENT =
  'A table of the top 10 open deals by value, showing company, stage, value and close date. Click a row to open that deal.';

const main = async (): Promise<void> => {
  const llms = architectLlms();
  if ('error' in llms) {
    console.error(llms.error);
    process.exit(2);
  }
  const ray = devRayContext();

  const trace = (event: CortexEvent): void => {
    if (event.type === 'tool-end') {
      const o = event.observation;
      console.log(`  · ${o.toolId} ${o.kind === 'result' ? 'ok' : `ERR ${o.kind === 'error' ? o.error : o.kind}`}`);
    }
    if (event.type === 'retry') console.log(`  · retry(${event.kind}): ${event.issues}`);
  };

  console.log(`Intent: ${INTENT}\nBuilding (watch the architect work)…`);
  const built = await runActionArchitect(ray, llms.agent, llms.support, INTENT, { onEvent: trace });
  if (!built.ok) {
    console.error(`\n✗ build failed: ${built.error}${built.issues ? `\n  issues: ${built.issues.join('; ')}` : ''}`);
    process.exit(1);
  }
  console.log(`\n✓ built "${built.action.id}" — ${built.reasoning ?? ''}`);

  const run = await runAction(ray, built.action);
  const keys = Object.keys(run.data);
  const firstArray = keys.map((k) => run.data[k]).find(Array.isArray) as unknown[] | undefined;
  console.log(`✓ mounts clean: ${run.ok} (issues: ${run.issues.length}${run.issues.length ? ' — ' + run.issues.join('; ') : ''})`);
  console.log(`  data keys: ${keys.join(', ')}`);
  console.log(`  loaded rows: ${firstArray ? `${firstArray.length} (sample ${JSON.stringify(firstArray[0])})` : 'none'}`);
  console.log(`\n--- generated action ---\n${JSON.stringify(built.action, null, 2)}`);
  process.exit(run.ok ? 0 : 1);
};

void main();
