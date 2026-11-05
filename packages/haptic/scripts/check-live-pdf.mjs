import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { prepareArtifact, engineProfile } from '../dist/index.js';
import { createWebOperations } from '../dist/operations/index.js';
import { blueprint as mechanical } from '../dist/discovery/blueprint.js';

const directory = resolve(
  'data/runs',
  'live-pdf-' + new Date().toISOString().replaceAll(/[:.]/g, '-'),
);
await mkdir(directory, { recursive: true });
const artifactBytes = await readFile(
  new URL('../tests/fixtures/http-pdf-download.json', import.meta.url),
);
const artifact = {
  ...JSON.parse(artifactBytes.toString()),
  stamp: mechanical.stamp,
  flows: mechanical.flows.filter((flow) => ['fetch', 'redirect'].includes(flow.id)),
};
const input = { url: 'https://www.rfc-editor.org/info/rfc9225' };
const limits = engineProfile;
await writeFile(resolve(directory, 'artifact.json'), JSON.stringify(artifact, null, 2) + '\n');
await writeFile(resolve(directory, 'input.json'), JSON.stringify(input, null, 2) + '\n');
const web = createWebOperations();
let responses = 0;
const operations = {
  ...web.operations,
  'http.get': {
    ...web.operations['http.get'],
    async run(request, context) {
      const response = await web.operations['http.get'].run(request, context);
      await writeFile(
        resolve(directory, `http-${++responses}.json`),
        JSON.stringify(response, null, 2) + '\n',
      );
      return response;
    },
  },
};
try {
  let start = performance.now();
  const prepared = await prepareArtifact(artifact, operations, limits);
  const preparationMs = performance.now() - start;
  start = performance.now();
  const outcome = await prepared.run(input);
  const runMs = performance.now() - start;
  await writeFile(resolve(directory, 'result.json'), JSON.stringify(outcome, null, 2) + '\n');
  assert.equal(outcome.status, 'completed');
  const { page, redirects, links, files } = outcome.value;
  assert.equal(page.status, 200);
  assert.equal(files.length, 1);
  const verify = (blob) => {
    const bytes = Buffer.from(blob.base64, 'base64');
    assert.equal(bytes.length, blob.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), blob.sha256);
    return bytes;
  };
  await writeFile(resolve(directory, 'page.entity'), verify(page.encoded));
  await writeFile(resolve(directory, 'page.html'), verify(page.body));
  const downloads = [];
  for (const [index, result] of files.entries()) {
    const file = result.source;
    assert.equal(file.status, 200);
    const bytes = verify(file.body);
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    await writeFile(resolve(directory, `download-${index}.entity`), verify(file.encoded));
    await writeFile(resolve(directory, `download-${index}.pdf`), bytes);
    downloads.push({
      url: file.url,
      bytes: bytes.length,
      sha256: file.body.sha256,
      signature: bytes.subarray(0, 8).toString(),
      redirects: result.redirects.map(({ url, status, headers }) => ({
        url,
        status,
        location: headers.location,
      })),
    });
  }
  const summary = {
    status: 'passed',
    at: new Date().toISOString(),
    input,
    limits,
    reader: 'unchanged defaults',
    preparationMs,
    runMs,
    redirects: redirects.map(({ url, status, headers }) => ({
      url,
      status,
      location: headers.location,
    })),
    page: { url: page.url, bytes: page.body.bytes },
    selection: links,
    downloads,
    modelsAvailable: false,
  };
  await writeFile(resolve(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ directory, ...summary }, null, 2));
} catch (error) {
  await writeFile(
    resolve(directory, 'failure.json'),
    JSON.stringify(
      {
        status: 'failed',
        at: new Date().toISOString(),
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      null,
      2,
    ) + '\n',
  );
  throw error;
} finally {
  web.close();
}
