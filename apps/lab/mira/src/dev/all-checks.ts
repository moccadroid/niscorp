import { spawnSync } from 'node:child_process';

const CHECKS: readonly (readonly [name: string, what: string, args?: readonly string[]])[] = [
  ['artifacts-check', 'src/app is data: pure JSON, every artifact parses its schema, every screen canvas opens an action with an input it takes'],
  ['strata', 'the source is written at the installed grammars (strata.lock.json)', ['status', '--check']],
  ['compose-check', 'a message is answered with a screen: the open screen read, picked, composed, checked, placed, written, and back again'],];

let failed = 0;
for (const [name, what, args = []] of CHECKS) {
  console.log(`\n── ${name} — ${what}`);
  const run = spawnSync(process.execPath, ['--import', 'tsx', `src/dev/${name}.ts`, ...args], { stdio: 'inherit' });
  if (run.status !== 0) failed += 1;
}

console.log(failed === 0 ? `\nAll ${CHECKS.length} checks pass.` : `\n${failed} of ${CHECKS.length} checks failed.`);
process.exit(failed === 0 ? 0 : 1);
