import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';
import { prepareArtifact } from '../src/index.js';
import { RunControl } from '../src/engine/control.js';
import { createWebOperations } from '../src/operations/index.js';
import artifact from './fixtures/download-links.json' with { type: 'json' };

const originalHtml = await readFile(new URL('./fixtures/files.html', import.meta.url), 'utf8');
const seen: string[] = [];
let addFile = false,
  failFile = false;
const server = createServer((request, response) => {
  const path = request.url ?? '/';
  seen.push(path);
  if (path === '/reset') {
    request.socket.destroy();
    return;
  }
  if (path === '/stall') return;
  if (path === '/list' || path === '/other/list') {
    let html =
      path === '/other/list' ? originalHtml.replace('/files/', '/other/files/') : originalHtml;
    if (addFile) html = html.replace('</main>', '<a data-file href="three.bin">Three</a></main>');
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-encoding': 'gzip',
      'content-security-policy': "default-src 'none'; base-uri *",
    });
    response.end(gzipSync(html));
  } else if (path.startsWith('/files/') || path.startsWith('/other/files/')) {
    response.writeHead(failFile ? 404 : 200, { 'content-type': 'application/octet-stream' });
    response.end(Buffer.from('original ' + path));
  } else {
    response.writeHead(404);
    response.end('unwanted');
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Missing fixture address');
const base = 'http://127.0.0.1:' + address.port;
const web = createWebOperations();
const blob = z.object({ base64: z.string(), bytes: z.number(), sha256: z.string() });
const rowsSchema = z.array(
  z.object({
    status: z.literal('completed'),
    value: z.object({ url: z.string(), encoded: blob, body: blob }),
    error: z.null(),
  }),
);
try {
  const prepared = await prepareArtifact(artifact, web.operations);
  for (const [path, expected] of [
    ['/list', '/files/'],
    ['/other/list', '/other/files/'],
  ]) {
    const result = await prepared.run({ url: base + path });
    assert.equal(result.status, 'completed');
    const rows = rowsSchema.parse(result.value);
    assert.equal(rows.length, 2);
    for (const [index, row] of rows.entries()) {
      const name = index === 0 ? 'one.bin' : 'two.bin';
      const bytes = Buffer.from('original ' + expected + name);
      assert.equal(row.value.url, base + expected + name);
      assert.deepEqual(Buffer.from(row.value.body.base64, 'base64'), bytes);
      assert.equal(row.value.encoded.bytes, bytes.length);
      assert.equal(row.value.encoded.sha256, createHash('sha256').update(bytes).digest('hex'));
    }
  }
  assert.equal(seen.includes('/menu.bin'), false);
  process.stdout.write(
    '[pass] web artifact: gzip page, scoped links, base resolution, exact original downloads, reusable helper and second URL\n',
  );
  addFile = true;
  const updated = rowsSchema.parse((await prepared.run({ url: base + '/list' })).value);
  assert.equal(updated.length, 3);
  assert.equal(updated[2]?.value.url, base + '/files/three.bin');
  process.stdout.write(
    '[pass] web artifact: unchanged prepared artifact discovers newly listed file without model calls\n',
  );
  failFile = true;
  const failed = await prepared.run({ url: base + '/list' });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error?.code, 'CHECK_FAILED');
  process.stdout.write(
    '[pass] web artifact: explicit JSON status check rejects missing download\n',
  );
  const source = await web.operations['http.get']?.run(
    { url: base + '/list' },
    { signal: new AbortController().signal },
  );
  assert(source && typeof source === 'object');
  const forged = { ...source, body: { base64: '', bytes: 1, sha256: 'wrong' } };
  await assert.rejects(
    async () =>
      web.operations['html.select']?.run(
        { source: forged, selector: 'a' },
        { signal: new AbortController().signal },
      ),
    (error: unknown) => error instanceof RunControl && error.code === 'BODY_MISMATCH',
  );
  process.stdout.write('[pass] web artifact: corrupted input body rejected\n');
  const recordArtifact = {
    ...artifact,
    flows: [],
    flow: {
      inputSchema: {},
      outputSchema: {},
      steps: [
        {
          id: 'requests',
          call: { operation: 'http.get' },
          each: { items: { $ref: '$.input' }, onFailure: 'record' },
          input: { url: { $ref: '$.item' } },
        },
      ],
      output: { $ref: '$.steps.requests.value' },
    },
  };
  const record = await prepareArtifact(recordArtifact, web.operations);
  const rows = z
    .array(z.object({ status: z.string(), error: z.object({ code: z.string() }).nullable() }))
    .parse((await record.run([base + '/reset'])).value);
  assert.equal(rows[0]?.status, 'failed');
  assert.equal(rows[0]?.error?.code, 'HTTP_TRANSPORT');
  process.stdout.write(
    '[pass] web artifact: socket reset recorded as expected operation failure\n',
  );
  const timed = createWebOperations({ transport: { headerTimeoutMs: 10 } });
  try {
    const prepared = await prepareArtifact(recordArtifact, timed.operations);
    const rows = z
      .array(z.object({ status: z.string(), error: z.object({ code: z.string() }).nullable() }))
      .parse((await prepared.run([base + '/stall'])).value);
    assert.equal(rows[0]?.error?.code, 'HTTP_TIMEOUT');
  } finally {
    timed.close();
  }
  process.stdout.write(
    '[pass] web artifact: header timeout recorded as expected operation failure\n',
  );
} finally {
  web.close();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
