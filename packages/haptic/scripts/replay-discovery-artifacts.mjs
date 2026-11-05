import profile from '../src/discovery/default-profile.json' with { type: 'json' };
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { prepareArtifact } from '../dist/index.js';
import { createWebOperations } from '../dist/operations/index.js';
import {
  assertResultContract,
  gradeDiscoveryResult,
  runReplay,
} from '../benchmarks/discovery-support.mjs';
import { evaluate } from '@niscorp/prism';
import { captureBody } from '../dist/operations/http-source.js';
import { mutateXmlSource } from '../benchmarks/xml-fixtures.mjs';
import { mutateHtmlSource } from '../benchmarks/html-fixtures.mjs';

assert.equal(process.env.GROQ_API_KEY, undefined);
const manifestPath = process.argv[2];
assert(manifestPath);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const directory = dirname(manifestPath);
const executionDirectory = await mkdtemp(resolve(directory, 'execution-'));
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
const suite = JSON.parse(await readFile(resolve(directory, 'suite.json'), 'utf8'));
// Reject ungradeable tasks before any artifact execution or live acquisition.
for (const trial of manifest) {
  const task = suite.cases.find((task) => task.id === trial.taskId);
  assert(task, 'Unknown replay task');
  assertResultContract(task);
}
let providerFetchCalls = 0;
globalThis.fetch = async () => {
  providerFetchCalls++;
  throw new Error('Provider fetch forbidden during artifact replay');
};
const web = createWebOperations();
let capturedSources;
let liveSources;
let variantLiveTargets = false;
let variantSourceUrl;
const capturedOperations = {
  ...web.operations,
  'http.get': {
    ...web.operations['http.get'],
    async run(input, context) {
      if (variantLiveTargets && input.url !== variantSourceUrl) {
        const source = await web.operations['http.get'].run(input, context);
        capturedSources.push(source);
        return source;
      }
      const source = capturedSources.findLast((source) => source.url === input.url);
      assert(source, 'Artifact requested an uncaptured URL: ' + input.url);
      return structuredClone(source);
    },
  },
};
const liveOperations = {
  ...web.operations,
  'http.get': {
    ...web.operations['http.get'],
    async run(input, context) {
      const source = await web.operations['http.get'].run(input, context);
      liveSources.push(source);
      return source;
    },
  },
};
const preparedArtifacts = new Map();
const results = [];
const grade = async (task, outcome, sources) => {
  if (outcome.status !== 'completed')
    return { grade: { exact: false }, referenceAvailable: false, error: outcome.error };
  try {
    return {
      grade: await gradeDiscoveryResult(task, outcome.value, sources, web.operations),
      referenceAvailable: true,
    };
  } catch (error) {
    return { grade: null, referenceAvailable: false, error: error.message };
  }
};
try {
  // Sequential replay owns the current capture and live response list.
  for (const [index, trial] of manifest.entries()) {
    const task = suite.cases.find((task) => task.id === trial.taskId);
    assert(task, 'Unknown replay task');
    const artifactBytes = await readFile(trial.artifactPath);
    assert.equal(createHash('sha256').update(artifactBytes).digest('hex'), trial.artifactSha256);
    capturedSources = JSON.parse(await readFile(trial.sourcesPath, 'utf8'));
    const artifact = JSON.parse(artifactBytes);
    const start = performance.now();
    if (!preparedArtifacts.has(trial.artifactSha256)) {
      preparedArtifacts.set(trial.artifactSha256, {
        captured: await prepareArtifact(artifact, capturedOperations, profile.trial),
        live: await prepareArtifact(artifact, liveOperations, profile.trial),
      });
    }
    const prepared = preparedArtifacts.get(trial.artifactSha256);
    const preparationMs = performance.now() - start;
    const runStart = performance.now();
    const outcome = await runReplay(prepared.captured, { url: task.url });
    const runMs = performance.now() - runStart;
    const row = {
      id: trial.id,
      artifactSha256: trial.artifactSha256,
      status: outcome.status,
      ...(await grade(task, outcome, capturedSources)),
      preparationMs,
      runMs,
    };
    row.capturedEvidencePath = resolve(executionDirectory, index + '-captured.json');
    await save(row.capturedEvidencePath, outcome);
    results.push(row);
    await save(resolve(executionDirectory, 'replay-progress.json'), { complete: false, results });
    liveSources = [];
    const liveStart = performance.now();
    const freshOutcome = await runReplay(prepared.live, { url: task.url });
    const freshRunMs = performance.now() - liveStart;
    row.freshEvidencePath = resolve(executionDirectory, index + '-fresh.json');
    await save(row.freshEvidencePath, { outcome: freshOutcome, sources: liveSources });
    row.fresh = {
      status: freshOutcome.status,
      sourceChanged: liveSources.some(
        (source) =>
          source.body.sha256 !==
          capturedSources.findLast((saved) => saved.url === source.url)?.body.sha256,
      ),
      httpRequests: liveSources.length,
      runMs: freshRunMs,
      ...(await grade(task, freshOutcome, liveSources)),
    };
    row.variants = [];
    const originals = capturedSources;
    for (const variant of task.variants ?? []) {
      variantLiveTargets = variant.liveTargets === true;
      variantSourceUrl = variant.sourceUrl;
      if (variantLiveTargets) assert.equal(typeof variantSourceUrl, 'string');
      capturedSources = await Promise.all(
        originals.map(async (source) => {
          if (variant.sourceUrl && source.url !== variant.sourceUrl) return source;
          if (variant.html)
            return source.status === 200 ? mutateHtmlSource(source, variant.html) : source;
          if (task.expectedFormat === 'xml')
            return source.status === 200
              ? mutateXmlSource(source, variant.xml, AbortSignal.timeout(profile.trial.maxActiveMs))
              : source;
          assert.equal(task.expectedFormat, 'json', 'Inline document mutations require JSON');
          if (source.status !== 200) return source;
          const parsed = await web.operations['json.read'].run(
            { source },
            { signal: AbortSignal.timeout(profile.trial.maxActiveMs) },
          );
          const document = evaluate(
            variant.document,
            { input: parsed },
            { limits: profile.trial.prism },
          );
          const body = captureBody(Buffer.from(JSON.stringify(document)));
          const headers = { ...source.headers, 'content-length': [String(body.bytes)] };
          delete headers['content-encoding'];
          return { ...source, headers, encoded: body, body };
        }),
      );
      const start = performance.now();
      let outcome;
      try {
        outcome = await runReplay(prepared.captured, { url: task.url });
      } catch (error) {
        if (!variant.expectedErrorCodes?.includes(error?.code)) throw error;
        outcome = {
          status: 'rejected',
          value: null,
          error: { code: error.code, message: error.message },
        };
      }
      const runMs = performance.now() - start;
      const evidencePath = resolve(
        executionDirectory,
        index + '-variant-' + row.variants.length + '.json',
      );
      await save(evidencePath, { outcome, sources: capturedSources });
      row.variants.push({
        id: variant.id,
        status: outcome.status,
        runMs,
        evidencePath,
        ...(variant.expectedErrorCodes
          ? {
              grade: {
                exact:
                  outcome.status !== 'completed' &&
                  variant.expectedErrorCodes.includes(outcome.error?.code),
              },
              referenceAvailable: true,
              expectedRejection: true,
            }
          : await grade(task, outcome, capturedSources)),
      });
    }
    variantLiveTargets = false;
    variantSourceUrl = undefined;
    capturedSources = originals;
    await save(resolve(executionDirectory, 'replay-progress.json'), { complete: false, results });
  }
  assert.equal(providerFetchCalls, 0);
  const report = {
    modelsAvailable: false,
    providerFetchCalls,
    registeredOperations: Object.keys(web.operations),
    reusablePreparedArtifacts: preparedArtifacts.size,
    results,
  };
  await save(resolve(executionDirectory, 'replay-results.json'), report);
  await save(resolve(directory, 'replay-results.json'), report);
  console.log(
    'AI-free replay: ' +
      results.length +
      ' saved artifacts; ' +
      results.filter((r) => r.grade?.exact).length +
      ' exact results on original captures. Fresh results recorded separately.',
  );
} finally {
  web.close();
}
