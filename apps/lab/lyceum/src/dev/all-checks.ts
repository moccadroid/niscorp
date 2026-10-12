// Each check runs in its own process over its own fresh database: a shared
// database would make the order of the suite part of its meaning.
import { spawnSync } from 'node:child_process';
import { CHECKS } from './suite';

const env = { ...process.env, LYCEUM_MODERATION: 'fake', LYCEUM_QUERY: 'fake', LYCEUM_TIMER: 'fake', LYCEUM_ASSISTANT: 'fake' };
const failed = CHECKS.filter((name) => spawnSync('node', ['--import', 'tsx', `src/dev/${name}.ts`], { stdio: 'inherit', shell: false, env }).status !== 0);

console.log(failed.length === 0 ? `\nall ${CHECKS.length} checks passed` : `\n${failed.length} of ${CHECKS.length} checks failed: ${failed.join(', ')}`);
process.exit(failed.length === 0 ? 0 : 1);
