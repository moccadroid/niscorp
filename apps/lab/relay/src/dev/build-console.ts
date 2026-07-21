// Builds the F12-console bundle (dist/console.js) and prints how to use it.
// `pnpm console`. The ignored-bare-import warnings are tsup's pure chunk
// re-exports under `sideEffects:false` — esbuild drops them correctly, so
// they're silenced (see the --log-override rationale in the commit).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const port = process.env['PORT'] ?? '8787';

const main = async (): Promise<void> => {
  const result = await build({
    entryPoints: [`${root}/src/console.ts`],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    logOverride: { 'ignored-bare-import': 'silent' },
    outfile: `${root}/dist/console.js`,
    metafile: true,
  });
  const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;

  const b = (s: string): string => `\x1b[1m${s}\x1b[0m`;
  const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
  const cyan = (s: string): string => `\x1b[36m${s}\x1b[0m`;

  console.log(`\n  ${b('dist/console.js')}  ${dim(`${(bytes / 1024).toFixed(1)}kb`)}\n`);
  console.log(`  Relay in any webpage's devtools console. Next:\n`);
  console.log(`  ${b('1.')} start (or ${b('restart')}) the server so it serves the bundle:`);
  console.log(`       ${cyan('pnpm serve')}   ${dim('# GET /console.js, with CORS')}\n`);
  console.log(`  ${b('2.')} open any page, F12 → Console, and paste:`);
  console.log(`       ${cyan(`await fetch('http://localhost:${port}/console.js').then(r => r.text()).then(eval)`)}`);
  console.log(`     ${dim('strict-CSP pages (GitHub, banks) block the fetch — paste the file contents instead,')}`);
  console.log(`     ${dim("and note ws:// may still be refused by connect-src. Marketing pages work.")}\n`);
  console.log(`  ${b('3.')} drive it:`);
  console.log(`       ${cyan("act(1, 'alex'); act(2); act(1)")}   ${dim('# sign in')}`);
  console.log(`       ${cyan('refs()')}   ${dim('# table every [n]')}   ${cyan('relayQuit()')}   ${dim('# disconnect')}\n`);
};

void main();
