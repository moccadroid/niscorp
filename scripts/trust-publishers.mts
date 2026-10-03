// Tell npm that every published @niscorp package is published by the Release
// workflow, and by nothing else.
//
// npm's trusted publishing replaces a stored token: GitHub vouches for one
// workflow file, in one environment, in one repository, and npm accepts that
// for the packages that name it. It can only be set on a package that already
// exists on npm — so this runs ONCE, after the first release was published by
// hand (docs/releasing.md), and again for any package added later.
//
// Needs npm 11.15.0 or later (`npm trust`), an npm login with publish rights
// on the @niscorp scope, and two-factor authentication on that account; npm
// asks for a code as it goes.
//
// `pnpm npm:trust`. Exits non-zero if any package was not set.

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPOSITORY = 'moccadroid/niscorp';
const WORKFLOW = '.github/workflows/release.yml';
const ENVIRONMENT = 'npm';
const root = resolve(import.meta.dirname, '..');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// `npm trust` arrived in npm 11.15.0.
const npmVersion = spawnSync('npm', ['--version'], { encoding: 'utf8' }).stdout.trim();
const [major = 0, minor = 0] = npmVersion.split('.').map(Number);
if (major < 11 || (major === 11 && minor < 15)) {
  console.log(`[fail] npm ${npmVersion} has no \`npm trust\` — it needs 11.15.0 or later: npm install --global npm@latest`);
  process.exit(1);
}

// Every package this repository publishes: not private, under packages/.
const published = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry): string[] => {
    const manifest: unknown = JSON.parse(readFileSync(join(root, 'packages', entry.name, 'package.json'), 'utf8'));
    return isRecord(manifest) && typeof manifest['name'] === 'string' && manifest['private'] !== true ? [manifest['name']] : [];
  })
  .sort();

let failures = 0;
for (const name of published) {
  const result = spawnSync('npm', ['trust', 'github', name, '--file', WORKFLOW, '--repo', REPOSITORY, '--env', ENVIRONMENT, '--allow-publish', '--yes'], {
    stdio: 'inherit',
  });
  if (result.status === 0) {
    console.log(`[pass] ${name} trusts ${REPOSITORY} · ${WORKFLOW} · environment ${ENVIRONMENT}`);
  } else {
    console.log(`[fail] ${name} — npm trust exited ${result.status ?? 'without a status'}`);
    failures += 1;
  }
}

if (failures > 0) {
  console.log(`[fail] ${failures} of ${published.length} packages are not set — the lines above say which, and npm said why`);
  process.exit(1);
}
console.log(`[pass] all ${published.length} packages trust the Release workflow — now disallow tokens on each (docs/releasing.md)`);
