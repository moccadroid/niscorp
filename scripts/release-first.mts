// The first release, from this machine — once.
//
// npm lets a package trust a CI workflow only after the package exists, so
// version 0.1.0 of every @niscorp package is published from a terminal, and
// everything after it by the Release workflow (docs/releasing.md). This is that
// one terminal step, with every precondition checked before anything leaves
// the machine:
//
//   1. on main, nothing uncommitted — what is published is what is committed
//   2. npm new enough for `npm trust`, logged in, and allowed to publish under
//      @niscorp (a member of the niscorp organization)
//   3. which packages are not on npm yet
//   4. build them, and run the same package checks CI runs
//   5. publish (`pnpm release`) — npm asks for a two-factor code
//   6. make each package trust the Release workflow (`pnpm npm:trust`)
//
// It stops at the first thing that is not right and says what to do. Run it
// again after a stop: what is already published is skipped, and so is a
// package that already trusts the workflow.
//
// `pnpm release:first`             — the release
// `pnpm release:first --dry-run`   — every check, the build, and npm's own dry
//                                     run; nothing is published or changed

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ORG = 'niscorp';
const root = resolve(import.meta.dirname, '..');
const dry = process.argv.includes('--dry-run');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// A command, from the repository root. `show` hands it the terminal — for what
// asks the person something (a two-factor code) or prints its own progress.
const run = (command: string, args: readonly string[], show = false): { ok: boolean; out: string } => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: show ? 'inherit' : 'pipe' });
  return { ok: result.status === 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
};

let problems = 0;
const pass = (line: string): void => console.log(`[pass] ${line}`);
// In a dry run a failed precondition is reported and the rest still runs; for
// real, it stops here.
const fail = (line: string, fix: string): void => {
  console.log(`[fail] ${line}\n       → ${fix}`);
  problems += 1;
  if (!dry) process.exit(1);
};

console.log(dry ? '— the first release, rehearsed: nothing is published —\n' : '— the first release —\n');

// 1. What is published is what is committed.
const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).out;
if (branch === 'main') pass('on main');
else fail(`on "${branch}", not main`, 'git switch main');
// A change to a committed file anywhere can reach a package (its source, the
// build config, the lockfile), and so can a new file inside one. A new file
// elsewhere — a local editor or agent setting — cannot: a package publishes
// its own folder.
const dirty = run('git', ['status', '--porcelain'])
  .out.split('\n')
  .filter((line) => line.trim() !== '' && (!line.startsWith('??') || line.slice(3).startsWith('packages/')));
if (dirty.length === 0) pass('nothing uncommitted that could be published');
else fail(`uncommitted changes would be published without being committed:\n         ${dirty.join('\n         ')}`, 'commit them, or set them aside, first');

// 2. npm, and who it is logged in as.
const npmVersion = run('npm', ['--version']).out;
const [major = 0, minor = 0] = npmVersion.split('.').map(Number);
if (major > 11 || (major === 11 && minor >= 15)) pass(`npm ${npmVersion}`);
else fail(`npm ${npmVersion} is too old for \`npm trust\` (11.15.0 or later)`, 'npm install --global npm@11');

const whoami = run('npm', ['whoami']);
const user = whoami.ok ? whoami.out.split('\n').pop()?.trim() ?? '' : '';
if (user !== '') pass(`logged in to npm as ${user}`);
else fail('not logged in to npm', 'npm login');

if (user !== '') {
  const membership = run('npm', ['org', 'ls', ORG, user, '--json']);
  let role = '';
  try {
    const parsed: unknown = JSON.parse(membership.out);
    const found = isRecord(parsed) ? parsed[user] : undefined;
    role = typeof found === 'string' ? found : '';
  } catch {
    role = '';
  }
  if (role === 'owner' || role === 'admin') pass(`${user} is ${role} of the ${ORG} organization — may publish @${ORG}/*`);
  else if (role === 'developer') pass(`${user} is a developer in ${ORG} — publishing needs a team with write access to these packages`);
  else fail(`${user} is not a member of the ${ORG} npm organization (npm said: ${membership.out.split('\n')[0] ?? 'nothing'})`, `log in as an owner of ${ORG}, or add ${user} on npmjs.com → ${ORG} → Members`);
}

// 3. Which packages npm does not have yet.
const packages = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry): { name: string; version: string }[] => {
    const manifest: unknown = JSON.parse(readFileSync(join(root, 'packages', entry.name, 'package.json'), 'utf8'));
    if (!isRecord(manifest) || manifest['private'] === true) return [];
    const { name, version } = manifest;
    return typeof name === 'string' && typeof version === 'string' ? [{ name, version }] : [];
  })
  .sort((a, b) => a.name.localeCompare(b.name));
const missing = packages.filter((pkg) => !run('npm', ['view', `${pkg.name}@${pkg.version}`, 'version']).ok);
if (missing.length === 0) pass(`all ${packages.length} packages are already on npm — nothing to publish`);
else console.log(`[note] to publish: ${missing.map((pkg) => `${pkg.name}@${pkg.version}`).join(', ')}`);

// 4. Built, and checked the way CI checks them.
console.log('\n— building the packages —');
if (run('pnpm', ['turbo', 'build', '--filter=./packages/*'], true).ok) pass('packages built');
else fail('the build failed', 'the output above says where');
console.log('\n— checking them as a consumer gets them —');
if (run('pnpm', ['check:packages'], true).ok) pass('check:packages');
else fail('check:packages failed', 'the output above says which package');

// 5. Publish.
if (dry) {
  console.log('\n— npm’s own dry run —');
  if (run('pnpm', ['-r', '--filter', './packages/*', 'publish', '--dry-run', '--no-git-checks', '--access', 'public'], true).ok) pass('npm would publish them');
  else fail('npm’s dry run failed', 'the output above says why');
  console.log(problems === 0 ? '\n[pass] rehearsal clean — `pnpm release:first` publishes' : `\n[fail] ${problems} thing(s) to fix first — each says how`);
  process.exit(problems === 0 ? 0 : 1);
}

if (missing.length > 0) {
  console.log('\n— publishing (npm asks for a two-factor code) —');
  if (run('pnpm', ['release'], true).ok) pass('published');
  else fail('publishing stopped part way', 'run `pnpm release:first` again — what is already on npm is skipped');
}

// 6. From now on, the Release workflow publishes.
console.log('\n— trusting the Release workflow —');
if (run('node', ['scripts/trust-publishers.mts'], true).ok) pass('every package trusts the Release workflow');
else fail('some packages do not trust the workflow yet', 'run `pnpm release:first` again — what is set is skipped');

console.log(`
[pass] the first release is out.

What is left is on GitHub, in the browser:
  1. Settings → Actions → General → Workflow permissions:
     allow GitHub Actions to create and approve pull requests
  2. Settings → Secrets and variables → Actions → Variables:
     NPM_RELEASE = on
And, when you like: push the release tags (git push origin --tags), and on
npmjs.com set each package to "Require two-factor authentication and disallow
tokens", so the workflow is the only way to publish.`);
