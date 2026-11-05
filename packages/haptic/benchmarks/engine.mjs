import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { prepareArtifact, defineOperation, artifactStamp } from '../dist/index.js';
import { z } from 'zod';
import { createWebOperations } from '../dist/operations/index.js';
import downloadArtifact from '../tests/fixtures/download-links.json' with { type: 'json' };

const stamp = await artifactStamp(),
  samples = 40;
const ref = (path) => ({ $ref: path });
const completed = (value) => ({ status: 'completed', value, error: null });
const counter = defineOperation({
  input: z.number(),
  output: z.number(),
  run: (value) => value + 1,
});
const signal = new AbortController().signal;
const summarize = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
};
const compare = async (name, direct, execute, batch = 1) => {
  assert.deepEqual(await execute(), await direct());
  for (let i = 0; i < 10; i++) {
    await direct();
    await execute();
  }
  const baseline = [],
    engine = [];
  const measure = async (run, into) => {
    const start = performance.now();
    for (let i = 0; i < batch; i++) await run();
    into.push((performance.now() - start) / batch);
  };
  for (let i = 0; i < samples; i++) {
    if (i % 2) {
      await measure(execute, engine);
      await measure(direct, baseline);
    } else {
      await measure(direct, baseline);
      await measure(execute, engine);
    }
  }
  const directStats = summarize(baseline),
    engineStats = summarize(engine);
  const result = {
    name,
    samples,
    batch,
    direct: directStats,
    engine: engineStats,
    additionalMedianMs: engineStats.medianMs - directStats.medianMs,
  };
  process.stdout.write(JSON.stringify(result) + '\n');
  return result;
};
const results = [];
for (const count of [1, 10, 100, 1000]) {
  const artifact = {
    stamp,
    flow: {
      inputSchema: { type: 'number' },
      outputSchema: { type: 'number' },
      steps: Array.from({ length: count }, (_, i) => ({
        id: 's' + i,
        call: { operation: 'counter' },
        input: ref(i ? '$.steps.s' + (i - 1) + '.value' : '$.input'),
      })),
      output: ref('$.steps.s' + (count - 1) + '.value'),
    },
    flows: [],
  };
  const start = performance.now();
  const prepared = await prepareArtifact(artifact, { counter });
  const preparationMs = performance.now() - start;
  const direct = async () => {
    let value = 0;
    for (let i = 0; i < count; i++) value = await counter.run(value, { signal });
    return completed(value);
  };
  results.push({
    ...(await compare(
      count + ' sequential calls',
      direct,
      () => prepared.run(0),
      count < 100 ? 20 : 1,
    )),
    preparationMs,
    calls: count,
  });
}
for (const count of [1, 100, 1000]) {
  const values = Array.from({ length: count }, (_, i) => i);
  const artifact = {
    stamp,
    flow: {
      inputSchema: { type: 'array' },
      outputSchema: { type: 'array' },
      steps: [
        {
          id: 'items',
          call: { operation: 'counter' },
          each: { items: ref('$.input'), onFailure: 'stop' },
          input: ref('$.item'),
        },
      ],
      output: ref('$.steps.items.value'),
    },
    flows: [],
  };
  const start = performance.now();
  const prepared = await prepareArtifact(artifact, { counter });
  const preparationMs = performance.now() - start;
  const direct = async () => {
    const output = [];
    for (const value of values) output.push(completed(await counter.run(value, { signal })));
    return completed(output);
  };
  results.push({
    ...(await compare(
      count + ' iterated calls',
      direct,
      () => prepared.run(values),
      count < 100 ? 20 : 1,
    )),
    preparationMs,
    calls: count,
  });
}

const html = await readFile(new URL('../tests/fixtures/files.html', import.meta.url)),
  encoded = gzipSync(html);
const payloads = new Map([
  ['/payload/64k', Buffer.alloc(65536, 91)],
  ['/payload/1m', Buffer.alloc(1048576, 173)],
]);
const server = createServer((request, response) => {
  response.sendDate = false;
  if (payloads.has(request.url)) {
    response.writeHead(200, { 'content-type': 'application/octet-stream' });
    response.end(payloads.get(request.url));
  } else if (request.url === '/list') {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-encoding': 'gzip',
    });
    response.end(encoded);
  } else {
    response.writeHead(200, { 'content-type': 'application/octet-stream' });
    response.end('original ' + request.url);
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const url = 'http://127.0.0.1:' + address.port + '/list',
  web = createWebOperations();
let nativeMs = 0,
  httpMs = 0,
  calls = 0;
const measured = Object.fromEntries(
  Object.entries(web.operations).map(([name, operation]) => [
    name,
    {
      ...operation,
      async run(input, context) {
        const start = performance.now();
        try {
          return await operation.run(input, context);
        } finally {
          const elapsed = performance.now() - start;
          nativeMs += elapsed;
          if (name === 'http.get') httpMs += elapsed;
          calls++;
        }
      },
    },
  ]),
);
try {
  const start = performance.now();
  const prepared = await prepareArtifact(downloadArtifact, measured);
  const preparationMs = performance.now() - start;
  const direct = async () => {
    const page = await measured['http.get'].run({ url }, { signal });
    assert.equal(page.status, 200);
    const links = await measured['html.select'].run(
      { source: page, selector: 'main[data-list] a[data-file]' },
      { signal },
    );
    const results = [];
    for (const link of links.items) {
      const resolved = await measured['url.resolve'].run(
        { value: link.attributes.href, base: links.baseUrl, encoding: links.encoding },
        { signal },
      );
      const file = await measured['http.get'].run({ url: resolved }, { signal });
      assert.equal(file.status, 200);
      results.push(completed({ url: file.url, encoded: file.encoded, body: file.body }));
    }
    return completed(results);
  };
  const result = await compare('HTTP page, HTML selection and two downloads', direct, () =>
    prepared.run({ url }),
  );
  nativeMs = 0;
  httpMs = 0;
  calls = 0;
  const wallStart = performance.now();
  const proof = await prepared.run({ url });
  const wallMs = performance.now() - wallStart;
  assert.equal(proof.value.length, 2);
  assert.equal(
    Buffer.from(proof.value[0].value.body.base64, 'base64').toString(),
    'original /files/one.bin',
  );
  assert.equal(
    Buffer.from(proof.value[1].value.body.base64, 'base64').toString(),
    'original /files/two.bin',
  );
  results.push({
    ...result,
    preparationMs,
    oneRunBreakdown: {
      wallMs,
      nativeMs,
      httpMs,
      interpreterAndBoundaryMs: wallMs - nativeMs,
      nativeCalls: calls,
    },
    output: proof,
  });
  for (const [path, payload] of payloads) {
    const input = { url: new URL(path, url).href };
    const artifact = {
      stamp,
      flow: {
        inputSchema: {},
        outputSchema: {},
        steps: [{ id: 'body', call: { operation: 'http.get' }, input: ref('$.input') }],
        output: ref('$.steps.body.value'),
      },
      flows: [],
    };
    const start = performance.now();
    const prepared = await prepareArtifact(artifact, measured, {
      prism: { maxStringLength: 16000000 },
    });
    const preparationMs = performance.now() - start;
    const result = await compare(
      'HTTP original body ' + payload.length + ' bytes',
      async () => completed(await measured['http.get'].run(input, { signal })),
      () => prepared.run(input),
    );
    const output = await prepared.run(input);
    assert.equal(output.status, 'completed');
    assert.deepEqual(Buffer.from(output.value.body.base64, 'base64'), payload);
    assert.equal(output.value.encoded.sha256, createHash('sha256').update(payload).digest('hex'));
    results.push({ ...result, preparationMs, bodyBytes: payload.length });
  }
} finally {
  web.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
const hash = createHash('sha256');
const sourceFiles = (await readdir(new URL('../src/', import.meta.url), { recursive: true }))
  .filter((path) => /\.(ts|json)$/.test(path))
  .sort();
for (const path of sourceFiles) {
  hash.update(path.replaceAll('\\', '/'));
  hash.update('\0');
  hash.update(await readFile(new URL('../src/' + path.replaceAll('\\', '/'), import.meta.url)));
}
const report = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  sourceSha256: hash.digest('hex'),
  methodology:
    'Compiled production engine. 40 interleaved samples after 10 warmups per path. Both paths call identical native operations with their native validation/ownership checks and return identical final shapes. The engine additionally interprets mappings, validates flow boundaries, keeps step outcomes and enforces run control. Timings exclude startup/imports. HTTP is loopback; page is gzip. Batch20 p95 describes batch averages, not single-call tails. Preparation is measured separately; first preparation includes cold effects. httpMs includes buffering, decoding, base64 and hashing, not just network latency.',
  results,
};
const directory = new URL(
  '../data/runs/engine-benchmark-' + new Date().toISOString().replaceAll(/[:.]/g, '-') + '/',
  import.meta.url,
);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL('engine-benchmark.json', directory),
  JSON.stringify(report, null, 2) + '\n',
);
