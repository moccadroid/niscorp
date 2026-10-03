import { spawnSync } from 'node:child_process';

// Every check, each in its own process over its own fresh database: a check ships the app a
// history, and a shared one would make the order of the suite part of its
// meaning. `nisc check` runs this. A new feature adds its check here.
const CHECKS: readonly (readonly [name: string, what: string, args?: readonly string[]])[] = [
  ['artifacts-check', 'src/app is data: pure JSON, and every artifact parses its schema'],
  ['strata', 'the source is written at the installed grammars (strata.lock.json)', ['status', '--check']],
  ['welcome-check', 'the welcome screen: served, drawn, and pressed'],
];

let failed = 0;
for (const [name, what, args = []] of CHECKS) {
  console.log(`\n── ${name} — ${what}`);
  const run = spawnSync(process.execPath, ['--import', 'tsx', `src/dev/${name}.ts`, ...args], { stdio: 'inherit' });
  if (run.status !== 0) failed += 1;
}

console.log(failed === 0 ? `\nAll ${CHECKS.length} checks pass.` : `\n${failed} of ${CHECKS.length} checks failed.`);
process.exit(failed === 0 ? 0 : 1);
