try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}

import type { CortexEvent } from '@niscorp/cortex';
import { buildScreen, checkScreen } from '@relay/screen-builder';
import { screenSetup } from '@relay/server/functions/ray/screens';
import { llmFor } from '@relay/server/llm';
import { devRayContext } from './engine';

const INTENT = 'A table of the top 10 open deals by value, showing company, stage, value and close date. Click a row to open that deal.';

const main = async (): Promise<void> => {
  const llm = llmFor('architect');
  if ('error' in llm) {
    console.error(llm.error);
    process.exit(2);
  }
  const setup = screenSetup(devRayContext());

  const trace = (event: CortexEvent): void => {
    if (event.type === 'tool-end') {
      const o = event.observation;
      console.log(`  · ${o.toolId} ${o.kind === 'result' ? 'ok' : `ERR ${o.kind === 'error' ? o.error : o.kind}`}`);
    }
  };

  console.log(`Intent: ${INTENT}\nBuilding…`);
  const built = await buildScreen(INTENT, setup, { llm: llm.llm, onEvent: trace });
  if (!built.ok) {
    console.error(`\n✗ build failed: ${built.error}${built.findings.length > 0 ? `\n  last check: ${built.findings.map((finding) => finding.message).join('; ')}` : ''}`);
    process.exit(1);
  }
  console.log(`\n✓ built "${built.action.id}" with ${built.probes.length} probe(s)`);

  const again = await checkScreen(built.action, setup, { probes: built.probes, proofs: built.proofs });
  console.log(`✓ checks again: ${again.ok}${again.ok ? '' : ` — ${again.findings.map((finding) => finding.message).join('; ')}`}`);
  console.log(`  loaded: ${JSON.stringify(again.loaded)}`);
  console.log(`\n--- generated action ---\n${JSON.stringify(built.action, null, 2)}\n--- probes ---\n${JSON.stringify(built.probes, null, 2)}`);
  process.exit(again.ok ? 0 : 1);
};

void main();
