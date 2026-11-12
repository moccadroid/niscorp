import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The packed package, installed offline in a consumer outside the checkout: generated artifacts run on their saved
// pages with every model and codec import refused, and the entry points typecheck with and without optional peers.
const fixtures = fileURLToPath(new URL('../tests/fixtures/discovery/', import.meta.url));
await mkdir(resolve('data/runs'), { recursive: true });
const evidence = await mkdtemp(resolve('data/runs/package-'));
const consumer = await mkdtemp(resolve(tmpdir(), 'haptic-package-'));
const relativeConsumer = relative(process.cwd(), consumer);
assert(
  isAbsolute(relativeConsumer) || relativeConsumer.startsWith('..'),
  'Consumer must be outside the checkout',
);
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) =>
    [
      'systemroot',
      'windir',
      'path',
      'temp',
      'tmp',
      'comspec',
      'pathext',
      'localappdata',
      'appdata',
    ].includes(name.toLowerCase()),
  ),
);
const run = async (args, cwd, name, executable = process.execPath) => {
  const chunks = [];
  const code = await new Promise((accept, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: { ...environment, CI: 'true' },
      windowsHide: true,
    });
    child.stdout.on('data', (bytes) => chunks.push(bytes));
    child.stderr.on('data', (bytes) => chunks.push(bytes));
    child.on('error', reject);
    child.on('close', accept);
  });
  await writeFile(resolve(evidence, name + '.log'), Buffer.concat(chunks));
  assert.equal(code, 0, name + ' failed; see ' + evidence);
  return Buffer.concat(chunks).toString('utf8');
};
const pnpm = process.env.npm_execpath;
assert(pnpm, 'Run through pnpm run check:package so its executable is explicit');
await run([pnpm, 'pack', '--pack-destination', evidence], process.cwd(), 'pack');
const archives = (await readdir(evidence)).filter((name) => name.endsWith('.tgz'));
assert.equal(archives.length, 1);
const archive = resolve(evidence, archives[0]);
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(pkg.name, '@niscorp/haptic');
await writeFile(
  resolve(consumer, 'package.json'),
  JSON.stringify({
    private: true,
    type: 'module',
    dependencies: {
      [pkg.name]: 'file:' + archive,
      ...Object.fromEntries(
        Object.entries(pkg.peerDependencies)
          .filter(([name]) => !pkg.peerDependenciesMeta?.[name]?.optional)
          .map(([name]) => [name, pkg.devDependencies[name]]),
      ),
    },
    devDependencies: {
      typescript: pkg.devDependencies.typescript,
      '@types/node': pkg.devDependencies['@types/node'],
    },
  }),
);
// Compiler platform packages are optional dependencies, not Haptic's optional peers.
await writeFile(resolve(consumer, '.npmrc'), 'auto-install-peers=false\noptional=true\n');
let lockRoot = process.cwd();
while (!(await readdir(lockRoot)).includes('pnpm-lock.yaml')) {
  const parent = dirname(lockRoot);
  assert.notEqual(parent, lockRoot, 'No package or workspace lockfile found');
  lockRoot = parent;
}
await writeFile(
  resolve(consumer, 'pnpm-lock.yaml'),
  await readFile(resolve(lockRoot, 'pnpm-lock.yaml')),
);
await run(
  [pnpm, 'install', '--offline', '--ignore-scripts', '--no-frozen-lockfile'],
  consumer,
  'install-core',
);
await writeFile(
  resolve(consumer, 'guard.mjs'),
  `
export const resolve = (specifier, context, next) => {
  if (/^(@niscorp\\/(cortex|signal)(\\/|$)|openai(\\/|$)|imagescript(\\/|$))/.test(specifier))
    throw new Error('Optional model/codec import forbidden while running an artifact: ' + specifier);
  return next(specifier, context);
};
`,
);
const samples = [];
for (const name of (await readdir(fixtures)).filter((n) => n.endsWith('.json'))) {
  const fixture = JSON.parse(await readFile(resolve(fixtures, name), 'utf8'));
  assert(fixture.expect.artifact, name + ' has no expected artifact');
  samples.push({
    id: name,
    artifact: fixture.expect.artifact,
    url: fixture.request.url,
    pages: fixture.pages,
    data: fixture.expect.data,
  });
}
assert(samples.length > 0);
await writeFile(resolve(consumer, 'samples.json'), JSON.stringify(samples));
await writeFile(
  resolve(consumer, 'execute.mjs'),
  `
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { prepareArtifact } from '${pkg.name}';
import { HAPTIC_SEQUENCE, HAPTIC_SCHEMAS } from '${pkg.name}/migrations';
assert.equal(HAPTIC_SEQUENCE.id, 'nisc.haptic');
assert.deepEqual(Object.keys(HAPTIC_SCHEMAS), ['nisc.haptic/artifact']);
assert.equal(process.env.GROQ_API_KEY, undefined);
const require = createRequire(import.meta.url);
const packageRequire = createRequire(require.resolve('${pkg.name}/package.json'));
for (const optional of ['@niscorp/cortex', '@niscorp/signal', 'openai', 'imagescript']) {
  assert.throws(() => require.resolve(optional), { code: 'MODULE_NOT_FOUND' });
  assert.throws(() => packageRequire.resolve(optional), { code: 'MODULE_NOT_FOUND' });
}
globalThis.fetch = () => { throw new Error('Provider fetch forbidden'); };
const samples = JSON.parse(await readFile('samples.json', 'utf8'));
let runs = 0;
for (const sample of samples) {
  const pages = new Map(sample.pages.map((page) => [page.url, page]));
  const prepared = prepareArtifact(sample.artifact);
  for (let i = 0; i < 2; i++) {
    const outcome = await prepared.run({ url: sample.url }, { signal: AbortSignal.timeout(60000), pages: async (url) => structuredClone(pages.get(url) ?? assert.fail('Uncaptured page: ' + url)) });
    assert.deepEqual(outcome.data, sample.data, sample.id);
    runs++;
  }
}
console.log(JSON.stringify({ artifacts: samples.length, runs, modelImports: 0 }));
`,
);
await run(['--experimental-loader', './guard.mjs', 'execute.mjs'], consumer, 'execution');
const typecheck = (file, name) =>
  run(
    [
      pnpm,
      'exec',
      'tsc',
      '--noEmit',
      '--strict',
      '--module',
      'NodeNext',
      '--target',
      'ES2022',
      '--types',
      'node',
      file,
    ],
    consumer,
    name,
  );
await writeFile(
  resolve(consumer, 'core.ts'),
  `
import { prepareArtifact, createWebTransport, type WalkResult, type Artifact } from '${pkg.name}';
import { HAPTIC_SEQUENCE } from '${pkg.name}/migrations';
const web = createWebTransport();
const run = async (artifact: Artifact): Promise<WalkResult> => prepareArtifact(artifact).run({ url: 'https://example.test/' }, { web, signal: AbortSignal.timeout(1000) });
void run; void HAPTIC_SEQUENCE; web.close();
`,
);
await typecheck('core.ts', 'types-core');
await run(
  [
    pnpm,
    'add',
    '--offline',
    '--ignore-scripts',
    '@niscorp/cortex@' + pkg.devDependencies['@niscorp/cortex'],
    '@niscorp/signal@' + pkg.devDependencies['@niscorp/signal'],
    'openai@' + pkg.devDependencies.openai,
  ],
  consumer,
  'install-discovery',
);
await writeFile(
  resolve(consumer, 'consumer.ts'),
  `
import { discover, type DiscoveryResult } from '${pkg.name}/discovery';
import { search, duckduckgo, type SearchResult } from '${pkg.name}/search';
const found = (): Promise<DiscoveryResult> => discover({ url: 'https://example.test/', instruction: 'Read the page.' }, { groqKey: 'not-used' });
const searched = (): Promise<SearchResult> => search({ instruction: 'Read the page.' }, { groqKey: 'not-used', typesafeKey: 'not-used', provider: duckduckgo });
void found; void searched;
`,
);
await typecheck('consumer.ts', 'types');
await run(['--experimental-strip-types', 'consumer.ts'], consumer, 'discovery-import');
// Inspect the archive, not pnpm's installed directory, which adds dependency links.
const packedFiles = (await run(['-tzf', archives[0]], evidence, 'contents', 'tar'))
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((name) => !name.endsWith('/'))
  .map((name) => name.replace(/^package\//, ''));
assert(
  packedFiles.every(
    (name) =>
      ['package.json', 'README.md', 'LICENSE', 'DESIGN.md', 'STATUS.md'].includes(name) ||
      name.startsWith('dist/'),
  ),
  'Unexpected packed file',
);
for (const target of Object.values(pkg.exports))
  for (const path of typeof target === 'string' ? [target] : Object.values(target))
    assert(packedFiles.includes(path.replace(/^\.\//, '')), 'Missing export target: ' + path);
for (const path of [
  'dist/render/child.mjs',
  'dist/web/default-profile.json',
  'dist/connector/default-profile.json',
  'dist/readers/html/default-profile.json',
  'dist/readers/xml/default-profile.json',
  'dist/discovery/output-rejection.json',
  'dist/search/image-choice/imagescript-profile.json',
])
  assert(packedFiles.includes(path), 'Missing runtime asset: ' + path);
assert(
  packedFiles.every(
    (name) =>
      !/(?:^|\/)(?:data|node_modules|benchmarks|scripts|tests|\.git|\.env(?:\.[^/]*)?)(?:\/|$)/i.test(
        name,
      ) &&
      !/\.(?:pem|key|tgz)$/i.test(name) &&
      (!name.endsWith('.ts') || name.endsWith('.d.ts')),
  ),
  'A secret, test or source file is packed',
);
console.log(
  `Package check: ${samples.length} generated artifacts ran twice each from the packed package with no model import; entry points typecheck with and without optional peers; ${packedFiles.length} files packed.`,
);
