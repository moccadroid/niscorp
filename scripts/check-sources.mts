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

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const lab = join(root, 'apps', 'lab');
const apps = readdirSync(lab).filter((name) => existsSync(join(lab, name, 'strata.lock.json')));

// On Windows pnpm is pnpm.cmd, which execFileSync cannot spawn: it goes through
// the shell there, as one command string. Everywhere else, no shell.
const strataStatus = (cwd: string): string => {
  const options = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] } as const;
  return process.platform === 'win32'
    ? execSync('pnpm -s strata status --check', options)
    : execFileSync('pnpm', ['-s', 'strata', 'status', '--check'], options);
};

// What a failed run said: its stdout, else its stderr, else the error itself
// (a spawn that never started has neither).
const failureOf = (error: unknown): string => {
  if (typeof error !== 'object' || error === null) return String(error);
  for (const key of ['stdout', 'stderr'] as const) {
    const stream = key in error ? String(Reflect.get(error, key) ?? '').trim() : '';
    if (stream !== '') return stream;
  }
  return error instanceof Error ? error.message : String(error);
};

let failed = 0;
for (const app of apps) {
  try {
    const out = strataStatus(join(lab, app));
    console.log(`[pass] ${app}: ${out.trim().replace(/^\[pass\] /, '')}`);
  } catch (error) {
    failed += 1;
    console.log(`[fail] ${app}:`);
    for (const line of failureOf(error).split(/\r?\n/)) console.log(`       ${line}`);
  }
}
if (apps.length === 0) console.log('[info] no app keeps a strata.lock.json');
process.exit(failed > 0 ? 1 : 0);
