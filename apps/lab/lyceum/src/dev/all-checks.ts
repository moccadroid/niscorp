// Every lyceum check, each in its own process over its own fresh database —
// checks ship the app different histories, and a shared database would make
// the order of the suite part of its meaning.
import { spawnSync } from 'node:child_process';

const CHECKS = ['sorting-check'];

const failed = CHECKS.filter((name) => spawnSync('node', ['--import', 'tsx', `src/dev/${name}.ts`], { stdio: 'inherit', shell: false }).status !== 0);

console.log(failed.length === 0 ? `\nall ${CHECKS.length} checks passed` : `\n${failed.length} of ${CHECKS.length} checks failed: ${failed.join(', ')}`);
process.exit(failed.length === 0 ? 0 : 1);
