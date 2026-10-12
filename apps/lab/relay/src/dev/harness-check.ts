import type { ActionDefinition } from '@niscorp/nova';
import { getVexRuntime, devRayContext } from './engine';
import { runAction } from '@relay/server/functions/ray/architect/harness';
import { dealsAction } from '@relay/app/actions/domains/deal';

const main = async (): Promise<void> => {
  await getVexRuntime();
  const ray = devRayContext();
  const checks: [string, boolean][] = [];

  const deals = await runAction(ray, dealsAction);
  const rows = deals.data['rows'];
  checks.push([`deals runs clean (ok=${deals.ok}, issues=${deals.issues.length})`, deals.ok]);
  checks.push([`deals loaded rows (got ${Array.isArray(rows) ? rows.length : 'none'})`, Array.isArray(rows) && rows.length > 0]);
  checks.push([`deals cleared its loading flag (got ${String(deals.data['loading'])})`, deals.data['loading'] === false]);

  const dataOnly: ActionDefinition = {
    id: 'probe.deals-read',
    data: { rows: [], search: '', ownerId: '', sortBy: 'deals.created_at', sortDir: 'desc' },
    endpoints: { load: dealsAction.endpoints!['load']! },
    lifecycle: { mount: [{ call: 'load' }] },
  };
  const probe = await runAction(ray, dataOnly);
  const probed = probe.data['rows'];
  checks.push([`data-only probe loads the read (ok=${probe.ok}, rows=${Array.isArray(probed) ? probed.length : 'none'})`, probe.ok && Array.isArray(probed) && probed.length > 0]);

  const bad = await runAction(ray, { id: 123, endpoints: 'nope' });
  checks.push([`schema-invalid def is gated (ok=${bad.ok}, issues=${bad.issues.length})`, !bad.ok && bad.issues.length > 0]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — the harness runs candidate actions and reports the truth (no LLM).' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};

void main();
