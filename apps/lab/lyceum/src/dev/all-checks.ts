// Every lyceum check, each in its own process over its own fresh database —
// checks ship the app different histories, and a shared database would make
// the order of the suite part of its meaning.
import { spawnSync } from 'node:child_process';
import { CHECKS } from './suite';

// The checks never call a model: names and questions are judged by the
// deterministic moderator, queries by the deterministic router and query
// writer, the timers written by the deterministic timer writer, the assistant
// answered by its deterministic stand-in.
const env = { ...process.env, LYCEUM_MODERATION: 'fake', LYCEUM_QUERY: 'fake', LYCEUM_TIMER: 'fake', LYCEUM_ASSISTANT: 'fake' };
const failed = CHECKS.filter((name) => spawnSync('node', ['--import', 'tsx', `src/dev/${name}.ts`], { stdio: 'inherit', shell: false, env }).status !== 0);

console.log(failed.length === 0 ? `\nall ${CHECKS.length} checks passed` : `\n${failed.length} of ${CHECKS.length} checks failed: ${failed.join(', ')}`);
process.exit(failed.length === 0 ? 0 : 1);
