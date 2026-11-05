import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Use a real returned artifact, its original captures and its recorded outcome.
const manifestPath = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../tests/fixtures/package/replay-manifest.json', import.meta.url));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assert(manifest.length > 0, 'A returned-artifact replay manifest is required');
const origin = dirname(manifestPath);
const suite = JSON.parse(await readFile(resolve(origin, 'suite.json'), 'utf8'));
const replay = JSON.parse(await readFile(resolve(origin, 'replay-results.json'), 'utf8'));
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
// Install the former while leaving model/codec peers absent until explicitly added.
await writeFile(resolve(consumer, '.npmrc'), 'auto-install-peers=false\noptional=true\n');
// Keep this offline consumer on the tested dependency graph. pnpm rewrites only its importer.
let lockRoot = process.cwd();
while (!(await readdir(lockRoot)).includes('pnpm-lock.yaml')) {
  const parent = dirname(lockRoot);
  assert.notEqual(parent, lockRoot, 'No package or workspace lockfile found');
  lockRoot = parent;
}
const lockBytes = await readFile(resolve(lockRoot, 'pnpm-lock.yaml'));
await writeFile(resolve(consumer, 'pnpm-lock.yaml'), lockBytes);
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
    throw new Error('Optional model/codec import forbidden during core execution: ' + specifier);
  return next(specifier, context);
};
`,
);
const samples = await Promise.all(
  manifest.map(async (entry) => {
    const bytes = await readFile(resolve(origin, entry.artifactPath));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.artifactSha256);
    const expected = replay.results.find((row) => row.id === entry.id);
    assert(expected?.grade?.exact, 'Package check needs an independently graded correct artifact');
    const task = suite.cases.find((task) => task.id === entry.taskId);
    assert(task);
    return {
      id: entry.id,
      artifact: JSON.parse(bytes),
      url: task.url,
      sources: JSON.parse(await readFile(resolve(origin, entry.sourcesPath), 'utf8')),
      expected: JSON.parse(await readFile(resolve(origin, expected.capturedEvidencePath), 'utf8')),
    };
  }),
);
await writeFile(resolve(consumer, 'samples.json'), JSON.stringify(samples));
await writeFile(
  resolve(consumer, 'execute.mjs'),
  `
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { prepareArtifact } from '${pkg.name}';
import { ENGINE_SEQUENCE, ENGINE_SCHEMAS } from '${pkg.name}/migrations';
assert.equal(ENGINE_SEQUENCE.id, 'eden.engine');
assert.deepEqual(Object.keys(ENGINE_SCHEMAS).sort(), ['eden.engine/artifact', 'eden.engine/flow', 'eden.engine/step']);
import { createWebOperations } from '${pkg.name}/operations';
import { imageChoiceProfile, imageChoiceWorkflow } from '${pkg.name}/search/image-choice';
assert.equal(process.env.GROQ_API_KEY, undefined);
const require = createRequire(import.meta.url);
const packageRequire = createRequire(require.resolve('${pkg.name}/package.json'));
for (const optional of ['@niscorp/cortex', '@niscorp/signal', 'openai', 'imagescript']) {
  assert.throws(() => require.resolve(optional), { code: 'MODULE_NOT_FOUND' });
  assert.throws(() => packageRequire.resolve(optional), { code: 'MODULE_NOT_FOUND' });
}
assert(imageChoiceProfile && imageChoiceWorkflow);
globalThis.fetch = () => { throw new Error('Provider fetch forbidden'); };
const web = createWebOperations();
let sources;
const operations = { ...web.operations, 'http.get': {
  ...web.operations['http.get'],
  async run(input) {
    const source = sources.findLast((source) => source.url === input.url);
    assert(source, 'Uncaptured HTTP request: ' + input.url);
    return structuredClone(source);
  },
}};
try {
  const samples = JSON.parse(await readFile('samples.json', 'utf8'));
  for (const sample of samples) {
    sources = sample.sources;
    const prepared = await prepareArtifact(sample.artifact, operations);
    const outcomes = await Promise.all([
      prepared.run({ url: sample.url }), prepared.run({ url: sample.url }),
    ]);
    for (const outcome of outcomes) assert.deepEqual(outcome, sample.expected);
  }
  console.log(JSON.stringify({ artifacts: samples.length, executions: samples.length * 2, modelImports: 0 }));
} finally { web.close(); }
`,
);
await run(['--experimental-loader', './guard.mjs', 'execute.mjs'], consumer, 'execution');
await writeFile(
  resolve(consumer, 'core.ts'),
  `
import { prepareArtifact, type Outcome } from '${pkg.name}';
import { ENGINE_SEQUENCE, ENGINE_SCHEMAS } from '${pkg.name}/migrations';
void ENGINE_SEQUENCE; void ENGINE_SCHEMAS;
import { createWebOperations } from '${pkg.name}/operations';
import { imageChoiceWorkflow, type ImageChoiceAdapters } from '${pkg.name}/search/image-choice';
const web = createWebOperations();
const prepare: typeof prepareArtifact = prepareArtifact;
const output: Outcome | null = null;
const adapters: ImageChoiceAdapters | null = null;
void prepare; void output; void adapters; void imageChoiceWorkflow; web.close();
`,
);
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
import { prepareArtifact, type Outcome } from '${pkg.name}';
import { createWebOperations } from '${pkg.name}/operations';
import { createDiscoveryOperations, discoveryWorkflow, discoveryProfile } from '${pkg.name}/discovery';
import { createSearchOperations, searchWorkflow, searchProfile } from '${pkg.name}/search';
import { createImageChallengeRecovery, imageChoiceProfile } from '${pkg.name}/search/image-choice';
const web = createWebOperations();
const discovery = createDiscoveryOperations({ author: { apiKey: 'not-used' }, profile: discoveryProfile });
const search = createSearchOperations({ author: { apiKey: 'not-used' }, searchProfile });
const run = async (): Promise<Outcome> => {
  const prepared = await prepareArtifact(discoveryWorkflow, discovery.operations, discovery.limits);
  return prepared.run({ url: 'https://example.test/', instruction: 'Read the page.' });
};
void run; void searchWorkflow; void createImageChallengeRecovery; void imageChoiceProfile;
web.close(); discovery.close(); search.close();
`,
);
await typecheck('consumer.ts', 'types');
await run(['--experimental-strip-types', 'consumer.ts'], consumer, 'discovery-import');
await run(
  [pnpm, 'add', '--offline', '--ignore-scripts', 'imagescript@' + pkg.devDependencies.imagescript],
  consumer,
  'install-codec',
);
await writeFile(
  resolve(consumer, 'codec.ts'),
  `
import assert from 'node:assert/strict';
import { createImageScriptPreparer, imageScriptProfile } from '${pkg.name}/search/image-choice/imagescript';
assert.equal(typeof createImageScriptPreparer(imageScriptProfile), 'function');
`,
);
await typecheck('codec.ts', 'types-codec');
await run(['--experimental-strip-types', 'codec.ts'], consumer, 'codec-import');
// Inspect the archive, not pnpm's installed directory, which adds dependency links.
const packedFiles = (await run(['-tzf', archive], process.cwd(), 'contents', 'tar'))
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((name) => !name.endsWith('/'))
  .map((name) => name.replace(/^package\//, ''));
assert(
  packedFiles.every(
    (name) =>
      ['package.json', 'README.md', 'LICENSE', 'DESIGN.md', 'DOCS.md'].includes(name) ||
      name.startsWith('dist/') ||
      name.startsWith('docs/development/') ||
      (name.startsWith('docs/measurements/') && pkg.files.includes(name)) ||
      (name.startsWith('docs/plans/') && pkg.files.includes(name)),
  ),
);
assert(packedFiles.includes('dist/discovery/discovery.json'));
assert(packedFiles.includes('dist/discovery/mechanical.json'));
for (const path of [
  'dist/discovery/source-author.js',
  'dist/discovery/html-view.js',
  'dist/discovery/captured-trial.json',
  'dist/discovery/grounded-resources.json',
])
  assert(packedFiles.includes(path), 'Missing source-grounded runtime asset: ' + path);
for (const name of [
  'candidate-builder.json',
  'html-review.json',
  'output-shaping.json',
  'json-adapter.json',
  'xml-adapter.json',
  'reference-following.json',
  'html-author.js',
  'xml-author.js',
  'output-author.js',
  'author-actions.js',
])
  assert(
    !packedFiles.includes('dist/discovery/' + name),
    'Retired discovery asset in package: ' + name,
  );
for (const target of Object.values(pkg.exports))
  for (const path of typeof target === 'string' ? [target] : Object.values(target))
    assert(packedFiles.includes(path.replace(/^\.\//, '')), 'Missing export target: ' + path);
for (const path of [
  'dist/search/search.json',
  'dist/search/default-profile.json',
  'dist/search/image-choice/recovery.json',
  'dist/search/image-choice/default-profile.json',
  'dist/search/image-choice/imagescript-profile.json',
  'docs/development/limitations.md',
])
  assert(packedFiles.includes(path), 'Missing runtime/document asset: ' + path);
assert(
  packedFiles.every(
    (name) =>
      !/(?:^|\/)(?:data|node_modules|benchmarks|scripts|tests|\.git|\.env(?:\.[^/]*)?)(?:\/|$)/i.test(
        name,
      ) &&
      !/\.(?:pem|key|tgz)$/i.test(name) &&
      (!name.endsWith('.ts') || name.endsWith('.d.ts')),
  ),
  'Unexpected source, research, dependency or credential file in archive',
);
const packedManifest = JSON.parse(
  await run(['-xOf', archive, 'package/package.json'], process.cwd(), 'packed-manifest', 'tar'),
);
assert.equal(packedManifest.private, pkg.private, 'Packing must preserve publication status');
for (const version of Object.values(packedManifest.dependencies ?? {}))
  assert(!/^(?:file|link|workspace|portal|patch):/.test(version), 'Local dependency in archive');
const result = {
  passed: true,
  archive,
  consumer,
  evidence,
  artifacts: samples.length,
  executions: samples.length * 2,
  modelImportsDuringExecution: 0,
  declarationsChecked: true,
  discoveryImportedWithoutProviderCall: true,
  searchImportedWithoutProviderCall: true,
  imageChoiceImportedWithoutCodec: true,
  codecImportedExplicitly: true,
  optionalPeersAbsentDuringCoreCheck: true,
  migrationsImportedAndTypechecked: true,
  nodeVersion: process.version,
  stagingIdentity: { name: pkg.name, version: pkg.version, private: pkg.private },
  dependencyLockSeedSha256: createHash('sha256').update(lockBytes).digest('hex'),
  packedFiles,
  archiveSha256: createHash('sha256')
    .update(await readFile(archive))
    .digest('hex'),
};
await writeFile(resolve(evidence, 'verification.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
