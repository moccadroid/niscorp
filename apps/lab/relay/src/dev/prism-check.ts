// Verifies the Prism money formatter in the deal-query mappings actually
// evaluates (Config is loosely typed, so tsc can't catch a malformed node).
// The mapping is WHOLE-SET now (a `$map` over `$.result`), so feed an array.
// Run: pnpm --filter relay exec tsx src/dev/prism-check.ts
import { evaluate } from '@niscorp/prism';
import { dealsByCompany } from '@relay/app/vex/deals.entries';

const mapping = dealsByCompany.mapping as Parameters<typeof evaluate>[0];
const cases: Array<[number, string]> = [
  [1_800_000, '$1.8M'],
  [1_000_000, '$1M'],
  [48_210, '$48K'],
  [1_000, '$1K'],
  [500, '$500'],
  [0, '$0'],
];

let ok = true;
for (const [value, expected] of cases) {
  const out = evaluate(mapping, { result: [{ deal_id: 'd', title: 'T', stage: 'S', value }] }) as Array<Record<string, unknown>>;
  // `value` is the raw number now; the money string is `value_display`.
  const got = out[0]?.['value_display'];
  const pass = got === expected && out[0]?.['value'] === value;
  ok = ok && pass;
  console.log(`${String(value).padStart(9)} → ${String(got).padEnd(8)} ${pass ? '✓' : `✗ expected ${expected}`}`);
}
console.log(ok ? '\nOK — money formats in Prism, whole-set, no JS mapping.' : '\nFAIL');
process.exit(ok ? 0 : 1);
