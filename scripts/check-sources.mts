// Every lab app's SOURCE is written at the grammars it runs on.
//
// Each app with a strata.lock.json records which version of every grammar its
// artifacts are written in. When a grammar moves (a migration lands in nova,
// Prism or the app's kit), this fails until the app has run `pnpm strata
// upgrade`, made the edits its report lists, and `pnpm strata verify` has moved
// the lock — so no app silently runs artifacts written for a grammar it no
// longer speaks.
//
// Run after `pnpm build`: pnpm check:sources

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const lab = join(root, 'apps', 'lab');
const apps = readdirSync(lab).filter((name) => existsSync(join(lab, name, 'strata.lock.json')));

let failed = 0;
for (const app of apps) {
  try {
    const out = execFileSync('pnpm', ['-s', 'strata', 'status', '--check'], { cwd: join(lab, app), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    console.log(`[pass] ${app}: ${out.trim().replace(/^\[pass\] /, '')}`);
  } catch (error) {
    failed += 1;
    const out = typeof error === 'object' && error !== null && 'stdout' in error ? String(error.stdout) : String(error);
    console.log(`[fail] ${app}:`);
    for (const line of out.trim().split('\n')) console.log(`       ${line}`);
  }
}
if (apps.length === 0) console.log('[info] no app keeps a strata.lock.json');
process.exit(failed > 0 ? 1 : 0);
