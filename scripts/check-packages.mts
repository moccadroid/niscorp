// Can the packages be consumed from OUTSIDE this workspace?
//
// Inside the monorepo every import resolves: pnpm links the workspace, hoists
// dev dependencies, and a package that forgets to declare what it imports
// still finds it next door. A consumer gets none of that — only the tarball
// and what its manifest declares. vex's `/hono` subpath imported `hono` while
// declaring it only as a devDependency, and solid pointed CJS types at a file
// the build never emits; both were green here and broken for anyone else.
//
// Three passes, all against the packed tarball rather than the source tree:
//   1. publint — the manifest is well-formed (files exist, conditions ordered)
//   2. attw    — every export resolves to matching types under node16 ESM + CJS
//   3. smoke   — the tarballs install into a scratch project outside the
//                workspace, and every export is imported (ESM) and required
//                (CJS, where the export map offers it)
//
// Run after `pnpm build`: `pnpm check:packages`. Exits non-zero on any failure.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const bin = (name: string): string => join(root, 'node_modules', '.bin', name);

// Subpaths that are ESM-only on purpose: ink is ESM-only with top-level await,
// so these cannot offer a `require` condition. attw skips them; the smoke pass
// still imports them.
const ESM_ONLY: Readonly<Record<string, readonly string[]>> = {
  '@niscorp/nova': ['./adapters/ink'],
  '@niscorp/moss': ['./terminal/ink'],
};

type Manifest = {
  name: string;
  exports: Record<string, { import?: unknown; require?: unknown }>;
  peerDependencies: Record<string, string>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readManifest = (dir: string): Manifest => {
  const raw: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (!isRecord(raw) || typeof raw['name'] !== 'string' || !isRecord(raw['exports'])) {
    throw new Error(`${dir}: package.json has no name or exports map`);
  }
  const exports: Manifest['exports'] = {};
  for (const [key, entry] of Object.entries(raw['exports'])) {
    exports[key] = isRecord(entry) ? { import: entry['import'], require: entry['require'] } : {};
  }
  const peers = isRecord(raw['peerDependencies']) ? raw['peerDependencies'] : {};
  const peerDependencies: Record<string, string> = {};
  for (const [name, range] of Object.entries(peers)) if (typeof range === 'string') peerDependencies[name] = range;
  return { name: raw['name'], exports, peerDependencies };
};

const results: { label: string; ok: boolean; detail?: string }[] = [];

const run = (label: string, cmd: string, args: readonly string[], cwd: string): void => {
  try {
    execFileSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' });
    results.push({ label, ok: true });
  } catch (error) {
    const detail = isRecord(error) ? `${String(error['stdout'] ?? '')}${String(error['stderr'] ?? '')}` : String(error);
    results.push({ label, ok: false, detail: detail.trim() });
  }
};

const packagesDir = join(root, 'packages');
const packages = readdirSync(packagesDir).map((name) => {
  const dir = join(packagesDir, name);
  return { dir, manifest: readManifest(dir) };
});

// ── 1 + 2: publint and attw, per package ────────────────────────────
for (const { dir, manifest } of packages) {
  run(`publint ${manifest.name}`, bin('publint'), ['--strict'], dir);
  const exclude = ESM_ONLY[manifest.name] ?? [];
  run(
    `attw ${manifest.name}`,
    bin('attw'),
    ['--pack', '.', '--profile', 'node16', ...(exclude.length > 0 ? ['--exclude-entrypoints', ...exclude] : [])],
    dir,
  );
}

// ── 3: install the tarballs outside the workspace and load every export ──
const scratch = mkdtempSync(join(tmpdir(), 'nisc-pack-'));
try {
  const tarballs: Record<string, string> = {};
  for (const { dir, manifest } of packages) {
    // `pnpm pack` is what rewrites `workspace:^` into a real range.
    const out = execFileSync('pnpm', ['pack', '--pack-destination', scratch], { cwd: dir, encoding: 'utf8' });
    const file = out.trim().split('\n').at(-1) ?? '';
    tarballs[manifest.name] = `file:${file}`;
  }

  // Every peer any package declares, at the range it declares — the consumer
  // supplies these. Workspace peers resolve to their tarballs.
  const peers: Record<string, string> = {};
  for (const { manifest } of packages) {
    for (const [name, range] of Object.entries(manifest.peerDependencies)) {
      if (!(name in tarballs)) peers[name] = range;
    }
  }

  writeFileSync(
    join(scratch, 'package.json'),
    JSON.stringify({
      name: 'nisc-pack-smoke',
      private: true,
      type: 'module',
      dependencies: { ...tarballs, ...peers },
      // Nothing is on the registry yet: packages that depend on each other must
      // resolve to the tarballs, not to npm.
      pnpm: { overrides: tarballs },
    }),
  );
  // Strict isolation is the point. npm (and pnpm's default hoisting) would put
  // moss's `hono` where vex could reach it too, and hide exactly the undeclared
  // import this check exists to catch. With hoisting off, a package sees only
  // what its own manifest declares.
  writeFileSync(join(scratch, '.npmrc'), 'hoist=false\n');
  run('install tarballs', 'pnpm', ['install', '--ignore-workspace', '--reporter=silent'], scratch);

  if (results.at(-1)?.ok === true) {
    for (const { manifest } of packages) {
      for (const [key, entry] of Object.entries(manifest.exports)) {
        const specifier = key === '.' ? manifest.name : `${manifest.name}/${key.slice(2)}`;
        if (entry.import !== undefined) {
          run(`import ${specifier}`, 'node', ['--input-type=module', '-e', `await import(${JSON.stringify(specifier)})`], scratch);
        }
        if (entry.require !== undefined) {
          run(`require ${specifier}`, 'node', ['--input-type=commonjs', '-e', `require(${JSON.stringify(specifier)})`], scratch);
        }
      }
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

for (const { label, ok, detail } of results) {
  console.log(`[${ok ? 'pass' : 'fail'}] ${label}`);
  if (!ok && detail !== undefined) console.log(detail.replace(/^/gm, '       '));
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed > 0 ? 1 : 0);
