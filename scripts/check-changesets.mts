// A breaking release must break its dependents too.
//
// nisc packages meet each other as peers, pinned `workspace:^`. When prism
// goes 0.1.0 → 0.2.0 (a minor: breaking, while we are on 0.x), every package
// that peers on it publishes with `^0.2.0` — its consumers must move prism to
// install it. That is a breaking change for THEM. Changesets does not see it:
// it bumps the dependents a patch (verified: moss 0.1.0 → 0.1.1, peer range
// silently moved). This refuses the plan until each dependent carries its own
// breaking changeset, and says which line to add.
//
// Run with pending changesets: `pnpm check:changesets`. Exits non-zero on a gap.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

type Release = { name: string; type: 'major' | 'minor' | 'patch' | 'none'; oldVersion: string; newVersion: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readReleases = (): readonly Release[] => {
  const scratch = mkdtempSync(join(tmpdir(), 'nisc-changesets-'));
  try {
    const out = join(scratch, 'status.json');
    // The CLI's JS entry through this node, not the .bin shim: on Windows the
    // shim is changeset.cmd, which execFileSync cannot spawn.
    const cli = join(root, 'node_modules', '@changesets', 'cli', 'bin.js');
    execFileSync(process.execPath, [cli, 'status', `--output=${out}`], { cwd: root, stdio: 'pipe' });
    const raw: unknown = JSON.parse(readFileSync(out, 'utf8'));
    if (!isRecord(raw) || !Array.isArray(raw['releases'])) throw new Error('changeset status: no releases array');
    return raw['releases'].flatMap((r: unknown): Release[] => {
      if (!isRecord(r)) return [];
      const { name, type, oldVersion, newVersion } = r;
      if (typeof name !== 'string' || typeof oldVersion !== 'string' || typeof newVersion !== 'string') return [];
      if (type !== 'major' && type !== 'minor' && type !== 'patch' && type !== 'none') return [];
      return [{ name, type, oldVersion, newVersion }];
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};

// Breaking under semver: a major, or — below 1.0 — a minor.
const isBreaking = (release: Release): boolean =>
  release.type === 'major' || (release.type === 'minor' && release.oldVersion.startsWith('0.'));

const breakingTypeFor = (version: string): 'major' | 'minor' => (version.startsWith('0.') ? 'minor' : 'major');

// Every workspace package → the workspace packages it depends or peers on.
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

const releases = readReleases();
const byName = new Map(releases.map((r) => [r.name, r]));
const gaps: string[] = [];
for (const release of releases.filter(isBreaking)) {
  for (const dependent of dependents.get(release.name) ?? []) {
    const own = byName.get(dependent.name);
    if (own !== undefined && isBreaking(own)) continue;
    gaps.push(
      `${release.name} ${release.oldVersion} → ${release.newVersion} is breaking; ${dependent.name} depends on it and would ship ` +
        `${own?.newVersion ?? dependent.version} (${own?.type ?? 'no release'}). Add to a changeset:  "${dependent.name}": ${breakingTypeFor(dependent.version)}`,
    );
  }
}

for (const release of releases.filter((r) => r.type !== 'none')) {
  console.log(`[plan] ${release.name.padEnd(18)} ${release.oldVersion} → ${release.newVersion} (${release.type}${isBreaking(release) ? ', breaking' : ''})`);
}
for (const gap of gaps) console.log(`[fail] ${gap}`);
if (gaps.length === 0) console.log('[pass] every dependent of a breaking release is itself released as breaking');
process.exit(gaps.length > 0 ? 1 : 0);
