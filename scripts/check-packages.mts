import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { builtinModules } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');

// execFileSync cannot spawn a .cmd on Windows: a tool is its JS entry run by
// this node, and pnpm goes through the shell there as one command string.
type Spawn = (cwd: string) => string;
const nodeRun = (args: readonly string[]): Spawn => (cwd) => execFileSync(process.execPath, args, { cwd, stdio: 'pipe', encoding: 'utf8' });
const tool = (pkg: string, name: string, args: readonly string[]): Spawn => {
  const manifest: unknown = JSON.parse(readFileSync(join(root, 'node_modules', pkg, 'package.json'), 'utf8'));
  const bins = isRecord(manifest) ? manifest['bin'] : undefined;
  const entry = isRecord(bins) ? bins[name] : undefined;
  if (typeof entry !== 'string') throw new Error(`${pkg}: no bin named ${name}`);
  return nodeRun([join(root, 'node_modules', pkg, entry), ...args]);
};
const pnpm = (args: readonly string[]): Spawn => (cwd) =>
  process.platform === 'win32'
    ? execSync(['pnpm', ...args.map((arg) => `"${arg}"`)].join(' '), { cwd, stdio: 'pipe', encoding: 'utf8' })
    : execFileSync('pnpm', args, { cwd, stdio: 'pipe', encoding: 'utf8' });

// ink is ESM-only with top-level await, so these subpaths cannot offer a
// `require` condition.
const ESM_ONLY: Readonly<Record<string, readonly string[]>> = {
  '@niscorp/nova': ['./adapters/ink'],
  '@niscorp/moss': ['./terminal/ink'],
};

// create-nisc runs as `npm create nisc`: nothing requires it.
const ESM_ONLY_PACKAGES: ReadonlySet<string> = new Set(['create-nisc']);

type Manifest = {
  name: string;
  exports: Record<string, { import?: unknown; require?: unknown }>;
  peerDependencies: Record<string, string>;
  optionalPeers: ReadonlySet<string>;
  dependencies: readonly string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readManifest = (dir: string): Manifest => {
  const raw: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (!isRecord(raw) || typeof raw['name'] !== 'string') throw new Error(`${dir}: package.json has no name`);
  const exports: Manifest['exports'] = {};
  for (const [key, entry] of Object.entries(isRecord(raw['exports']) ? raw['exports'] : {})) {
    exports[key] = isRecord(entry) ? { import: entry['import'], require: entry['require'] } : {};
  }
  const peers = isRecord(raw['peerDependencies']) ? raw['peerDependencies'] : {};
  const peerDependencies: Record<string, string> = {};
  for (const [name, range] of Object.entries(peers)) if (typeof range === 'string') peerDependencies[name] = range;
  const dependencies = isRecord(raw['dependencies']) ? Object.keys(raw['dependencies']) : [];
  const meta = isRecord(raw['peerDependenciesMeta']) ? raw['peerDependenciesMeta'] : {};
  const optionalPeers = new Set(Object.entries(meta).flatMap(([name, entry]) => (isRecord(entry) && entry['optional'] === true ? [name] : [])));
  return { name: raw['name'], exports, peerDependencies, optionalPeers, dependencies };
};

// The oldest zod with both things nisc relies on across copies: descriptions
// in a registry every copy shares (4.1.13) and the Standard JSON Schema hook
// caller schemas are converted through (4.2.0).
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

const run = (label: string, spawn: Spawn, cwd: string): void => {
  try {
    spawn(cwd);
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

// nisc packages are each other's peers, so an app holds one copy of each. A
// plain dependency is allowed only for something used purely inside (never in
// the published types, never authored by the app) and says why here.
const INTERNAL_DEPENDENCIES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  '@niscorp/cortex': { '@niscorp/solid': 'streams partial model output inside the loop; never in the API' },
};

for (const { dir, manifest } of packages) {
  // The meta package is the exception: its exact dependencies are what provides
  // the single copies.
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
  run(`publint ${manifest.name}`, tool('publint', 'publint', ['--strict']), dir);
  const exclude = ESM_ONLY[manifest.name] ?? [];
  if (Object.keys(manifest.exports).length === 0) continue;
  run(
    `attw ${manifest.name}`,
    tool('@arethetypeswrong/cli', 'attw', ['--pack', '.', '--profile', ESM_ONLY_PACKAGES.has(manifest.name) ? 'esm-only' : 'node16', ...(exclude.length > 0 ? ['--exclude-entrypoints', ...exclude] : [])]),
    dir,
  );
}

// Static imports only: an `import()` is how a feature loads an optional peer
// on demand.
const BUILTIN = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
// Parsed, not matched by a pattern: a string that holds the words `import` and
// `from` would read as a statement.
const staticImportsOf = (source: string): string[] =>
  ts
    .createSourceFile('built.js', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
    .statements.flatMap((statement) =>
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
        ? [statement.moduleSpecifier.text]
        : [],
    );
const packageOf = (specifier: string): string => specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
const entryFile = (entry: unknown): string | undefined =>
  typeof entry === 'string' ? entry : isRecord(entry) ? entryFile(entry['default']) : undefined;

const loadsOf = (file: string, seen = new Set<string>()): Set<string> => {
  const bare = new Set<string>();
  if (seen.has(file)) return bare;
  seen.add(file);
  for (const specifier of staticImportsOf(readFileSync(file, 'utf8'))) {
    if (specifier.startsWith('.')) for (const inner of loadsOf(resolve(dirname(file), specifier), seen)) bare.add(inner);
    else if (!BUILTIN.has(specifier)) bare.add(packageOf(specifier));
  }
  return bare;
};

for (const { dir, manifest } of packages) {
  const declared = new Set([manifest.name, ...manifest.dependencies, ...Object.keys(manifest.peerDependencies)]);
  for (const [key, entry] of Object.entries(manifest.exports)) {
    const file = entryFile(entry.import);
    if (file === undefined) continue;
    const loads = [...loadsOf(join(dir, file))].sort();
    const undeclared = loads.filter((name) => !declared.has(name));
    const optional = key === '.' ? loads.filter((name) => manifest.optionalPeers.has(name)) : [];
    const ok = undeclared.length === 0 && optional.length === 0;
    results.push({
      label: `${manifest.name}${key === '.' ? '' : key.slice(1)} loads only what it declares`,
      ok,
      ...(ok
        ? {}
        : {
            detail: [
              ...(undeclared.length > 0 ? [`imported but not declared: ${undeclared.join(', ')}`] : []),
              ...(optional.length > 0 ? [`the main entry imports what the manifest calls an optional peer: ${optional.join(', ')} — make it a required peer, or load it with import() where it is needed`] : []),
            ].join('; '),
          }),
    });
  }
}

const scratch = mkdtempSync(join(tmpdir(), 'nisc-pack-'));
try {
  const tarballs: Record<string, string> = {};
  for (const { dir, manifest } of packages) {
    // `pnpm pack` is what rewrites `workspace:^` into a real range.
    const out = pnpm(['pack', '--pack-destination', scratch])(dir);
    const file = out.trim().split('\n').at(-1) ?? '';
    tarballs[manifest.name] = `file:${file}`;
  }

  const peers: Record<string, string> = {};
  for (const { manifest } of packages) {
    for (const [name, range] of Object.entries(manifest.peerDependencies)) {
      if (!(name in tarballs)) peers[name] = range;
    }
  }
  // A second zod beside the app's own, at the oldest version the packages
  // accept: the duplicate a consumer can end up with.
  peers['zod-other'] = `npm:zod@${ZOD_FLOOR}`;

  writeFileSync(
    join(scratch, 'package.json'),
    JSON.stringify({
      name: 'nisc-pack-smoke',
      private: true,
      type: 'module',
      dependencies: { ...tarballs, ...peers },
      // Packages that depend on each other resolve to the tarballs, not to npm.
      pnpm: { overrides: tarballs },
    }),
  );
  // With hoisting, one package's dependency is reachable from another, which
  // hides the undeclared import this check exists to catch.
  writeFileSync(join(scratch, '.npmrc'), 'hoist=false\n');
  run('install tarballs', pnpm(['install', '--ignore-workspace', '--reporter=silent']), scratch);

  if (results.at(-1)?.ok === true) {
    for (const { manifest } of packages) {
      for (const [key, entry] of Object.entries(manifest.exports)) {
        const specifier = key === '.' ? manifest.name : `${manifest.name}/${key.slice(2)}`;
        if (entry.import !== undefined) {
          run(`import ${specifier}`, nodeRun(['--input-type=module', '-e', `await import(${JSON.stringify(specifier)})`]), scratch);
        }
        if (entry.require !== undefined) {
          run(`require ${specifier}`, nodeRun(['--input-type=commonjs', '-e', `require(${JSON.stringify(specifier)})`]), scratch);
        }
      }
    }

    for (const { manifest } of packages) {
      const specifier = `${manifest.name}/package.json`;
      run(
        `read ${specifier}`,
        nodeRun(['--input-type=module', '-e', `
          const { default: manifest } = await import(${JSON.stringify(specifier)}, { with: { type: 'json' } });
          if (manifest.name !== ${JSON.stringify(manifest.name)} || typeof manifest.version !== 'string') throw new Error('not the manifest of ${manifest.name}');
        `]),
        scratch,
      );
    }

    const probe = (label: string, body: string): void =>
      run(label, nodeRun(['--input-type=module', '-e', `
        import { z as other } from 'zod-other';
        import { z as own } from 'zod';
        if (other === own) throw new Error('zod-other resolved to the app copy — the scenario proves nothing');
        const schema = other.object({ field: other.string().describe('SENTINEL_DESCRIPTION') });
        ${body}
        if (!JSON.stringify(out).includes('SENTINEL_DESCRIPTION')) throw new Error('description lost: ' + JSON.stringify(out));
      `]), scratch);
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
