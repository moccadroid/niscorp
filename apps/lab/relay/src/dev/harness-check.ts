// The architect's harness, headless (no LLM). Proves `runAction` — the one
// verification primitive — really runs a candidate ActionDefinition in an
// isolated shell and reports the truth: data loaded, refs rendered, issues
// caught. Its first job is to characterize an action we ALREADY trust (`deals`).
// Run: pnpm --filter relay exec tsx src/dev/harness-check.ts
import type { ActionDefinition } from '@niscorp/nova';
import { getVexRuntime } from '../vex/runtime';
import { runAction } from '../ray/architect/harness';
import { dealsAction } from '../nova/domains/deal';

const main = async (): Promise<void> => {
  await getVexRuntime(); // boot PGlite + the prewarmed cache once
  const checks: [string, boolean][] = [];

  // 1. Characterize the real `deals` action: mount loads every prewarmed read,
  //    it renders without error, nothing throws.
  const deals = await runAction(dealsAction);
  const rows = deals.data['rows'];
  checks.push([`deals runs clean (ok=${deals.ok}, issues=${deals.issues.length})`, deals.ok]);
  checks.push([`deals loaded rows (got ${Array.isArray(rows) ? rows.length : 'none'})`, Array.isArray(rows) && rows.length > 0]);
  checks.push([`deals cleared its loading flag (got ${String(deals.data['loading'])})`, deals.data['loading'] === false]);

  // 2. The "discover an endpoint" path the agent uses: a tiny data-only action
  //    (one read + a mount hook + a target) → probe → read the real shape.
  const dataOnly: ActionDefinition = {
    id: 'probe.deals-read',
    data: { rows: [], search: '', ownerId: '', sortBy: 'deals.created_at', sortDir: 'desc' },
    endpoints: { load: dealsAction.endpoints!['load']! },
    lifecycle: { mount: [{ call: 'load' }] },
  };
  const probe = await runAction(dataOnly);
  const probed = probe.data['rows'];
  checks.push([`data-only probe loads the read (ok=${probe.ok}, rows=${Array.isArray(probed) ? probed.length : 'none'})`, probe.ok && Array.isArray(probed) && probed.length > 0]);

  // 3. The gate: a schema-invalid definition is rejected with issues, not run.
  const bad = await runAction({ id: 123, endpoints: 'nope' });
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
