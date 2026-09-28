// Points git at .githooks (the pre-push Verify). Run by the root `prepare`
// script on every `pnpm install` — including inside a Docker build, where there
// is no git and no .git: there is nothing to install a hook into, so it skips.
import { execFileSync } from 'node:child_process';

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
} catch {
  console.log('install-hooks: no git repository here; skipped');
}
