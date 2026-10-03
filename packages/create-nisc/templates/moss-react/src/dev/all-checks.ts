import { spawnSync } from 'node:child_process';

// Every check, each in its own process over its own fresh database: a check
// ships the app a history, and a shared database would make the order of the
// suite part of its meaning. `nisc check` runs this.
const CHECKS = [['welcome-check', 'the welcome screen: served, drawn, and pressed']] as const;

let failed = 0;
for (const [name, what] of CHECKS) {
  console.log(`\n── ${name} — ${what}`);
  const run = spawnSync(process.execPath, ['--import', 'tsx', `src/dev/${name}.ts`], { stdio: 'inherit' });
  if (run.status !== 0) failed += 1;
}

console.log(failed === 0 ? `\nAll ${CHECKS.length} checks pass.` : `\n${failed} of ${CHECKS.length} checks failed.`);
process.exit(failed === 0 ? 0 : 1);
