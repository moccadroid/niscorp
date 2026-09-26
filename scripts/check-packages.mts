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
  dependencies: readonly string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readManifest = (dir: string): Manifest => {
  const raw: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (!isRecord(raw) || typeof raw['name'] !== 'string') throw new Error(`${dir}: package.json has no name`);
  // A package with no `exports` ships no code (the @niscorp/nisc meta package):
  // it is linted and installed, but has no entrypoints to resolve or import.
  const exports: Manifest['exports'] = {};
  for (const [key, entry] of Object.entries(isRecord(raw['exports']) ? raw['exports'] : {})) {
    exports[key] = isRecord(entry) ? { import: entry['import'], require: entry['require'] } : {};
  }
  const peers = isRecord(raw['peerDependencies']) ? raw['peerDependencies'] : {};
  const peerDependencies: Record<string, string> = {};
  for (const [name, range] of Object.entries(peers)) if (typeof range === 'string') peerDependencies[name] = range;
  const dependencies = isRecord(raw['dependencies']) ? Object.keys(raw['dependencies']) : [];
  return { name: raw['name'], exports, peerDependencies, dependencies };
};

// zod is a peer of every package that touches it: schemas cross from the app
// into nisc, so the app owns the one copy. The floor is not arbitrary —
// 4.1.13 moved `.describe()`/`.meta()` into a registry shared across copies
// (before it, a schema from one copy converted by another silently lost every
// description), and 4.2.0 added the Standard JSON Schema hook nisc converts
// caller schemas through. Below 4.2.0 the second guarantee is gone.
const ZOD_FLOOR = '4.2.0';

const results: { label: string; ok: boolean; detail?: string }[] = [];

const minVersionOf = (range: string): readonly number[] => (range.match(/\d+(\.\d+){0,2}/)?.[0] ?? '0').split('.').map(Number);
const atLeast = (version: readonly number[], floor: readonly number[]): boolean => {
  for (let i = 0; i < floor.length; i++) {
    const a = version[i] ?? 0;
    const b = floor[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
};

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

// nisc packages meet each other as PEERS: an app holds one copy of each, so
// one grammar (one Prism, one nova) runs every artifact, and a value one
// package hands another is the same type on both sides. A plain dependency
// is allowed only for something used purely inside — never in the published
// types, never authored by the app — and says why here.
const INTERNAL_DEPENDENCIES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  '@niscorp/cortex': { '@niscorp/solid': 'streams partial model output inside the loop; never in the API' },
};

// ── 1 + 2: publint and attw, per package ────────────────────────────
for (const { dir, manifest } of packages) {
  // The meta package is the one exception by construction: it is what PROVIDES
  // the single copies — its exact dependencies are the set, installed once.
  const isMetaPackage = manifest.name === '@niscorp/nisc';
  for (const dependency of manifest.dependencies.filter((name) => name.startsWith('@niscorp/') && !isMetaPackage)) {
    const reason = INTERNAL_DEPENDENCIES[manifest.name]?.[dependency];
    results.push({
      label: `${manifest.name} → ${dependency}: ${reason === undefined ? 'must be a peer' : 'internal dependency, allowed'}`,
      ok: reason !== undefined,
      ...(reason === undefined ? { detail: 'a plain dependency on a nisc package: make it a peer, or allow it in INTERNAL_DEPENDENCIES with the reason' } : {}),
    });
  }
  const zodPeer = manifest.peerDependencies['zod'];
  if (manifest.dependencies.includes('zod')) {
    results.push({ label: `zod is a peer of ${manifest.name}`, ok: false, detail: 'zod is in dependencies — a second copy per package' });
  } else if (zodPeer !== undefined) {
    const ok = atLeast(minVersionOf(zodPeer), minVersionOf(ZOD_FLOOR));
    results.push({ label: `zod peer floor of ${manifest.name}`, ok, ...(ok ? {} : { detail: `${zodPeer} admits versions below ${ZOD_FLOOR}` }) });
  }
  run(`publint ${manifest.name}`, bin('publint'), ['--strict'], dir);
  const exclude = ESM_ONLY[manifest.name] ?? [];
  if (Object.keys(manifest.exports).length === 0) continue;
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
  // A SECOND zod, at the oldest version the packages accept, beside the app's
  // own copy — the duplicate every consumer can end up with (see ZOD_FLOOR).
  peers['zod-other'] = `npm:zod@${ZOD_FLOOR}`;

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

    // ── 4: a schema from ANOTHER zod copy keeps its descriptions ──────
    // Every place nisc turns a caller's schema into JSON Schema (signal's
    // wire, cortex's prompt docs, nova's layout palette) must convert it
    // through the schema's own copy. Converted by nisc's copy instead, a
    // pre-4.1.13 schema loses every `.describe()` without an error.
    const probe = (label: string, body: string): void =>
      run(label, 'node', ['--input-type=module', '-e', `
        import { z as other } from 'zod-other';
        import { z as own } from 'zod';
        if (other === own) throw new Error('zod-other resolved to the app copy — the scenario proves nothing');
        const schema = other.object({ field: other.string().describe('SENTINEL_DESCRIPTION') });
        ${body}
        if (!JSON.stringify(out).includes('SENTINEL_DESCRIPTION')) throw new Error('description lost: ' + JSON.stringify(out));
      `], scratch);
    probe(`second zod: signal wire schema`, `
      const { resolveTransport } = await import('@niscorp/signal');
      const caps = { nativeTools: true, nativeJsonMode: true, validatesToolArgs: false, supportsEmbedding: false,
                     nativeJsonSchema: true, toolsWithStructuredOutput: true, manglesNestedToolArgs: false };
      const out = resolveTransport({ wire: schema, looseWire: schema, responseMode: 'text', hasData: true, hasTools: false, choice: 'native' }, caps);`);
    probe(`second zod: cortex schemaDoc`, `
      const { schemaDoc } = await import('@niscorp/cortex');
      const out = schemaDoc(schema);`);
    probe(`second zod: nova palette`, `
      const { paletteEntryOf } = await import('@niscorp/nova');
      const out = paletteEntryOf('Probe', { propsSchema: schema });`);
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
