import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

type Release = { name: string; type: 'major' | 'minor' | 'patch' | 'none'; oldVersion: string; newVersion: string };
type Changeset = { id: string; summary: string; bumps: { name: string; type: string }[] };
type Plan = { releases: readonly Release[]; changesets: readonly Changeset[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readPlan = (): Plan => {
  const scratch = mkdtempSync(join(tmpdir(), 'nisc-changesets-'));
  try {
    const out = join(scratch, 'status.json');
    // The CLI's JS entry through this node, not the .bin shim: on Windows the
    // shim is changeset.cmd, which execFileSync cannot spawn.
    const cli = join(root, 'node_modules', '@changesets', 'cli', 'bin.js');
    execFileSync(process.execPath, [cli, 'status', `--output=${out}`], { cwd: root, stdio: 'pipe' });
    const raw: unknown = JSON.parse(readFileSync(out, 'utf8'));
    if (!isRecord(raw) || !Array.isArray(raw['releases']) || !Array.isArray(raw['changesets'])) throw new Error('changeset status: no releases or changesets array');
    const releases = raw['releases'].flatMap((r: unknown): Release[] => {
      if (!isRecord(r)) return [];
      const { name, type, oldVersion, newVersion } = r;
      if (typeof name !== 'string' || typeof oldVersion !== 'string' || typeof newVersion !== 'string') return [];
      if (type !== 'major' && type !== 'minor' && type !== 'patch' && type !== 'none') return [];
      return [{ name, type, oldVersion, newVersion }];
    });
    const changesets = raw['changesets'].flatMap((c: unknown): Changeset[] => {
      if (!isRecord(c) || typeof c['id'] !== 'string' || typeof c['summary'] !== 'string' || !Array.isArray(c['releases'])) return [];
      const bumps = c['releases'].flatMap((b: unknown) => (isRecord(b) && typeof b['name'] === 'string' && typeof b['type'] === 'string' ? [{ name: b['name'], type: b['type'] }] : []));
      return [{ id: c['id'], summary: c['summary'], bumps }];
    });
    return { releases, changesets };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};

const isBreaking = (release: Release): boolean =>
  release.type === 'major' || (release.type === 'minor' && release.oldVersion.startsWith('0.'));

const breakingTypeFor = (version: string): 'major' | 'minor' => (version.startsWith('0.') ? 'minor' : 'major');

const dependents = new Map<string, { name: string; version: string }[]>();
for (const dir of readdirSync(join(root, 'packages'))) {
  const raw: unknown = JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8'));
  if (!isRecord(raw) || typeof raw['name'] !== 'string' || typeof raw['version'] !== 'string') continue;
  const on = new Set<string>();
  for (const field of ['dependencies', 'peerDependencies']) {
    const block = raw[field];
    if (isRecord(block)) for (const name of Object.keys(block)) if (name.startsWith('@niscorp/')) on.add(name);
  }
  for (const target of on) {
    dependents.set(target, [...(dependents.get(target) ?? []), { name: raw['name'], version: raw['version'] }]);
  }
}

const { releases, changesets } = readPlan();
const byName = new Map(releases.map((r) => [r.name, r]));

for (const release of releases.filter((r) => r.type !== 'none')) {
  console.log(`[plan] ${release.name.padEnd(18)} ${release.oldVersion} → ${release.newVersion} (${release.type}${isBreaking(release) ? ', BREAKING' : ''})`);
}

const APPROVAL = /^\W*BREAKING\s*[—–-]+\s*approved by\s+\S/im;
const bumpsBreaking = (bump: { name: string; type: string }): boolean =>
  bump.type === 'major' || (bump.type === 'minor' && (byName.get(bump.name)?.oldVersion ?? '').startsWith('0.'));
const unapproved = changesets.filter((changeset) => changeset.bumps.some(bumpsBreaking) && !APPROVAL.test(changeset.summary));
if (unapproved.length > 0) {
  for (const changeset of unapproved) {
    const named = changeset.bumps.filter(bumpsBreaking).map((bump) => `${bump.name} ${bump.type}`).join(', ');
    console.log(`[fail] BREAKING, NOT APPROVED — .changeset/${changeset.id}.md bumps ${named}.`);
  }
  console.log('');
  console.log('       The @niscorp packages are live on npm. A release may not break an app that works');
  console.log('       on the release before it (STYLE_GUIDE.md, "The packages are live").');
  console.log('');
  console.log('       Not approved by the maintainer?  Then this is not a breaking release: make the');
  console.log('       change compatible and the bump `patch`. Do not add more breaking bumps to "complete" it.');
  console.log('       Approved?  The changeset says so, on a line of its own:');
  console.log('           BREAKING — approved by <who>, <date>: <what an app must change>');
  process.exit(1);
}

const gaps: string[] = [];
for (const release of releases.filter(isBreaking)) {
  for (const dependent of dependents.get(release.name) ?? []) {
    const own = byName.get(dependent.name);
    if (own !== undefined && isBreaking(own)) continue;
    gaps.push(
      `${release.name} ${release.oldVersion} → ${release.newVersion} is an approved breaking release; ${dependent.name} depends on it and would ship ` +
        `${own?.newVersion ?? dependent.version} (${own?.type ?? 'no release'}), which its consumers cannot install without moving. ` +
        `It breaks too — add to a changeset that carries the approval line:  "${dependent.name}": ${breakingTypeFor(dependent.version)}`,
    );
  }
}

for (const gap of gaps) console.log(`[fail] ${gap}`);
if (gaps.length === 0) {
  console.log(releases.some(isBreaking) ? '[pass] the breaking release in this plan is approved, and every dependent moves with it' : '[pass] nothing in this plan breaks an app');
}
process.exit(gaps.length > 0 ? 1 : 0);
