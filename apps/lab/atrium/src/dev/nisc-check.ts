// NISC CHECK — the command, run the way a person runs it (`pnpm nisc …`), on
// this app.
//
//   1. `nisc build` bundles the terminal and says how each path is served: the
//      about page a file, the app a server — with the reason, in words
//   2. `nisc export` refuses to write a site that cannot stand alone, writes
//      nothing, and says which path and how to go on
//   3. `nisc export --allow-live` writes every path as a file: the page as
//      nobody sees it, beside the bundle
//   4. a file never holds anybody: no cookie reaches a build, and the page it
//      wrote names nobody
//
// It spawns the real command (node_modules/.bin/nisc → @niscorp/cli) in a fresh
// process each time, as `all-checks` does for every check.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const results: [string, boolean][] = [];
const check = (label: string, pass: boolean): void => {
  results.push([label, pass]);
  console.log(`${pass ? '✓' : '✗'} ${label}`);
};

const nisc = (...args: string[]): { status: number; output: string } => {
  const run = spawnSync(join(root, 'node_modules', '.bin', 'nisc'), args, { cwd: root, encoding: 'utf8' });
  return { status: run.status ?? 1, output: `${run.stdout}${run.stderr}` };
};
const row = (output: string, path: string): string => output.split('\n').find((line) => /^[○●✗] /.test(line) && line.split(/\s+/)[1] === path) ?? '';

const out = mkdtempSync(join(tmpdir(), 'atrium-out-'));
rmSync(out, { recursive: true, force: true });

try {
  // ── 1. build ──
  const built = nisc('build');
  check('`nisc build` succeeds and leaves a built terminal', built.status === 0 && existsSync(join(root, 'dist', 'index.html')));
  check('…the about page is a file: nothing on it can still happen', /^○ \/about\s+page about\s+file\s+nothing on it can still happen/.test(row(built.output, '/about')));
  check('…the app wants a server, and says why in words', /^● \/\s+the app\s+server\s+auth\.login: a person can act on it/.test(row(built.output, '/')));

  // ── 2. export, refused ──
  const refused = nisc('export', '--skip-bundle', '--out', out);
  check('`nisc export` refuses a site that cannot stand alone', refused.status === 1 && refused.output.includes('1 of 2 paths cannot be a file alone (/)'));
  check('…writes nothing', !existsSync(out));
  check('…and says how to go on', refused.output.includes('nisc export --allow-live'));

  // ── 3. export, with a server beside it ──
  const written = nisc('export', '--skip-bundle', '--allow-live', '--out', out);
  check('`nisc export --allow-live` writes the site', written.status === 0 && existsSync(join(out, 'index.html')) && existsSync(join(out, 'about', 'index.html')));
  check('…beside the bundle it was built with', existsSync(join(out, 'assets')) && readdirSync(join(out, 'assets')).some((file) => file.endsWith('.js')));

  // ── 4. a file holds nobody ──
  const about = existsSync(join(out, 'about', 'index.html')) ? readFileSync(join(out, 'about', 'index.html'), 'utf8') : '';
  check('the about file is the page, drawn', about.includes('A guest-and-staff platform for hotels') && about.includes('"live":false'));
  check('…as nobody sees it', about.includes('"principal":false') && !about.includes('Signed in as'));
  const app = existsSync(join(out, 'index.html')) ? readFileSync(join(out, 'index.html'), 'utf8') : '';
  check('the app’s file is the lock screen, and says it is live', app.includes('"principal":false') && app.includes('"live":true') && /<div id="root"><[a-z]/.test(app));
} finally {
  rmSync(out, { recursive: true, force: true });
}

const failed = results.filter(([, ok]) => !ok).length;
console.log(failed === 0 ? `\nOK — the nisc command (${results.length} assertions)` : `\nFAIL — ${failed} of ${results.length} assertions failed in the nisc command`);
process.exit(failed === 0 ? 0 : 1);
