// Capture the lab apps' artifacts into the grammar corpus.
//
// Every action and fragment each lab app ships, exactly as it ships them, written
// to strata/corpus/<app>/<stamp>.json with the grammar stamp they were written
// at. `pnpm check:grammars` then upgrades every one of them to the current
// grammars and parses it with the current strict schemas — so a grammar change
// that would strand real documents fails CI, whatever the snapshot says.
//
// An era's capture (one stamp) may be refreshed while its grammars have not
// moved. Once a grammar gains a migration the stamp changes, the next capture
// lands in a new file, and the old one is frozen history: never edit it.
//
// Run: pnpm strata:corpus   (after `pnpm build`)

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NOVA_SEQUENCE } from '../packages/nova/dist/migrations/index.js';
import { PRISM_SEQUENCE } from '../packages/prism/dist/migrations/index.js';

const root = resolve(import.meta.dirname, '..');
const APPS = ['atrium', 'encore', 'lyceum', 'lyra', 'relay'] as const;

// Runs inside each app, with that app's own tsx and tsconfig paths, so its
// catalog imports resolve exactly as the app resolves them.
const DUMP = `import { readdirSync, existsSync } from 'node:fs';
const catalog = await import('./src/app/action-catalog.ts');
const defs = catalog.CATALOG_DEFINITIONS ?? catalog.ACTIONS;
const actions = Array.isArray(defs) ? defs : Object.values(defs ?? {});
const fragments = [];
const dir = './src/app/shell/fragments';
if (existsSync(dir)) for (const f of readdirSync(dir).filter((n) => n.endsWith('.fragment.ts'))) {
  const m = await import(dir + '/' + f);
  for (const v of Object.values(m)) if (v && typeof v === 'object' && v.kind === 'fragment') fragments.push(v);
}
process.stdout.write(JSON.stringify({ actions, fragments }));
`;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const stamp = { [NOVA_SEQUENCE.id]: NOVA_SEQUENCE.migrations.length, [PRISM_SEQUENCE.id]: PRISM_SEQUENCE.migrations.length };
const stampKey = Object.entries(stamp).map(([id, n]) => `${id.replace(/^nisc\./, '')}${n}`).join('-');

let skipped = 0;
for (const app of APPS) {
  const dir = join(root, 'apps', 'lab', app);
  const script = join(dir, '.strata-dump.mts');
  writeFileSync(script, DUMP);
  let out: string;
  try {
    out = execFileSync('pnpm', ['exec', 'tsx', '.strata-dump.mts'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    // An app that cannot be read right now (mid-edit, a missing file) is skipped
    // with the reason — its existing corpus file stays as it was — and the others
    // are still captured.
    const stderr = typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr) : String(error);
    const reason = stderr.split('\n').find((l) => /Error/.test(l)) ?? 'the dump failed';
    console.log(`[skip]   ${app}: ${reason.trim()}`);
    skipped += 1;
    continue;
  } finally {
    rmSync(script, { force: true });
  }
  const dumped: unknown = JSON.parse(out);
  if (!isRecord(dumped) || !Array.isArray(dumped['actions']) || !Array.isArray(dumped['fragments'])) throw new Error(`${app}: the dump is not { actions, fragments }`);
  const documents = [
    ...dumped['actions'].map((document) => ({ kind: 'nisc.nova/action', id: isRecord(document) ? String(document['id']) : '?', document })),
    ...dumped['fragments'].map((document) => ({ kind: 'nisc.nova/fragment', id: isRecord(document) ? String(document['id']) : '?', document })),
  ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  mkdirSync(join(root, 'strata', 'corpus', app), { recursive: true });
  writeFileSync(join(root, 'strata', 'corpus', app, `${stampKey}.json`), `${JSON.stringify({ app, stamp, documents }, null, 2)}\n`);
  console.log(`[corpus] ${app}: ${documents.length} documents → strata/corpus/${app}/${stampKey}.json`);
}

if (skipped > 0) console.log(`${skipped} app(s) skipped — run again once they build.`);
