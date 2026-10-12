import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPOSITORY = 'moccadroid/niscorp';
// npm takes the file's name, not a path, and reads it under .github/workflows/.
const WORKFLOW = 'release.yml';
const ENVIRONMENT = 'npm';
const root = resolve(import.meta.dirname, '..');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const npmVersion = spawnSync('npm', ['--version'], { encoding: 'utf8' }).stdout.trim();
const [major = 0, minor = 0] = npmVersion.split('.').map(Number);
if (major < 11 || (major === 11 && minor < 15)) {
  console.log(`[fail] npm ${npmVersion} has no \`npm trust\` — it needs 11.15.0 or later: npm install --global npm@11`);
  process.exit(1);
}

const everyPackage = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry): string[] => {
    const manifest: unknown = JSON.parse(readFileSync(join(root, 'packages', entry.name, 'package.json'), 'utf8'));
    return isRecord(manifest) && typeof manifest['name'] === 'string' && manifest['private'] !== true ? [manifest['name']] : [];
  })
  .sort();

const asked = process.argv.slice(2);
const strangers = asked.filter((name) => !everyPackage.includes(name));
if (strangers.length > 0) {
  console.log(`[fail] not a package this repository publishes: ${strangers.join(', ')}`);
  process.exit(1);
}
const published = asked.length > 0 ? asked : everyPackage;

const trusts = (name: string): string => {
  const listed = spawnSync('npm', ['trust', 'list', name, '--json'], { encoding: 'utf8' });
  return listed.status === 0 ? listed.stdout : '';
};

let failures = 0;
for (const name of published) {
  const listed = trusts(name);
  if (listed.includes(REPOSITORY) && listed.includes(WORKFLOW)) {
    console.log(`[pass] ${name} already trusts ${REPOSITORY} · ${WORKFLOW}`);
    continue;
  }
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
console.log(`[pass] ${published.length === 1 ? published[0] : `all ${published.length} packages`} trust${published.length === 1 ? 's' : ''} the Release workflow`);
