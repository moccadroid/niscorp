import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'tsup';

// The nisc release this build pins new apps to: every @niscorp package in the
// workspace, at the version it is at now — the set the templates beside this
// file are checked against (src/set.ts).
const packages = join(import.meta.dirname, '..');
const set: Record<string, string> = {};
for (const entry of readdirSync(packages, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifest: unknown = JSON.parse(readFileSync(join(packages, entry.name, 'package.json'), 'utf8'));
  if (manifest === null || typeof manifest !== 'object') continue;
  const name: unknown = Reflect.get(manifest, 'name');
  const version: unknown = Reflect.get(manifest, 'version');
  if (typeof name === 'string' && name.startsWith('@niscorp/') && typeof version === 'string') set[name] = version;
}

// ESM only: it runs as `npm create nisc`, nothing requires it. Both entries sit
// in dist/, beside each other, so `../templates` means the same folder to both.
export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
  format: ['esm'],
  dts: { entry: { index: 'src/index.ts' } },
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  external: ['@clack/prompts'],
  define: { __NISC_SET__: JSON.stringify(set) },
});
