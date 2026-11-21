import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { gzipSync, deflateSync } from 'node:zlib';
import { createRawHttpTransport } from '../src/connector/http-transport.endpoint.js';
import { HttpConfigurationSchema } from '../src/connector/http.schema.js';

const listen = async (server: Server): Promise<string> => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing loopback address');
  return 'http://127.0.0.1:' + address.port;
};
const close = async (server: Server): Promise<void> => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
};
const collect = async (source: AsyncIterable<Uint8Array>): Promise<Buffer> => {
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of source) {
    bytes += chunk.byteLength;
    if (bytes > 1000000) throw new Error('Fixture collector exceeded its independent bound');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};
let passed = 0;
const check = async (name: string, run: () => Promise<void>): Promise<void> => {
  await run();
  passed += 1;
  process.stdout.write('[pass] raw HTTP port: ' + name + '\n');
};
await check('actual encoded gzip and stacked entities remain exact', async () => {
  const content = Buffer.from('Original bytes: Grüße, \u0000 and repeated '.repeat(100));
  const encoded = new Map([
    ['/gzip', { body: gzipSync(content), coding: 'gzip' }],
    ['/stacked', { body: gzipSync(deflateSync(content)), coding: 'deflate, gzip' }],
  ]);
  const server = createServer((request, response) => {
    const fixture = encoded.get(request.url ?? '');
    if (!fixture) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, [
      'Content-Encoding',
      fixture.coding,
      'X-Capture',
      'first',
      'X-Capture',
      'second',
    ]);
    response.end(fixture.body);
  });
  const base = await listen(server),
    config = HttpConfigurationSchema.parse({});
  const raw = createRawHttpTransport(config);
  try {
    for (const [path, fixture] of encoded) {
      const response = await raw.get(new URL(base + path), {}, new AbortController().signal);
      assert.deepEqual(await collect(response.body), fixture.body);
      assert.equal(response.rawHeaders?.filter((value) => value === 'X-Capture').length, 2);
      response.dispose();
    }
  } finally {
    raw.close();
    await close(server);
  }
});
await check('unknown content coding is raw evidence rather than an attempted decoder', async () => {
  const bytes = Buffer.from([0, 255, 17, 92]);
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-encoding': 'fixture-unknown' });
    response.end(bytes);
  });
  const base = await listen(server),
    config = HttpConfigurationSchema.parse({});
  const raw = createRawHttpTransport(config);
  try {
    const response = await raw.get(new URL(base), {}, new AbortController().signal);
    assert.deepEqual(await collect(response.body), bytes);
    response.dispose();
  } finally {
    raw.close();
    await close(server);
  }
});
await check('one physical redirect response never follows its location', async () => {
  let calls = 0;
  const server = createServer((_request, response) => {
    calls += 1;
    response.writeHead(302, { location: '/next' });
    response.end('redirect evidence');
  });
  const base = await listen(server),
    raw = createRawHttpTransport(HttpConfigurationSchema.parse({}));
  try {
    const response = await raw.get(new URL(base), {}, new AbortController().signal);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/next');
    assert.equal((await collect(response.body)).toString(), 'redirect evidence');
    assert.equal(calls, 1);
    response.dispose();
  } finally {
    raw.close();
    await close(server);
  }
});
await check('configuration and request values are owned before asynchronous work', async () => {
  const seen: { url: string | undefined; header: string | string[] | undefined }[] = [];
  const server = createServer((request, response) => {
    seen.push({ url: request.url, header: request.headers['x-owned'] });
    setTimeout(() => response.end('done'), 60);
  });
  const base = await listen(server),
    config = HttpConfigurationSchema.parse({ headerTimeoutMs: 1000 });
  const raw = createRawHttpTransport(config);
  config.headerTimeoutMs = 1;
  try {
    const url = new URL(base + '/original'),
      headers = { 'x-owned': 'original' };
    const pending = raw.get(url, headers, new AbortController().signal);
    url.pathname = '/changed';
    headers['x-owned'] = 'changed';
    const response = await pending;
    assert.equal((await collect(response.body)).toString(), 'done');
    assert.deepEqual(seen, [{ url: '/original', header: 'original' }]);
    response.dispose();
  } finally {
    raw.close();
    await close(server);
  }
});
await check(
  'close aborts active bodies and queued requests and refuses further dispatch',
  async () => {
    let calls = 0;
    const server = createServer((_request, response) => {
      calls += 1;
      response.writeHead(200);
      response.write('prefix');
    });
    const base = await listen(server),
      raw = createRawHttpTransport(HttpConfigurationSchema.parse({ perOriginConcurrency: 1 }));
    try {
      const active = await raw.get(new URL(base), {}, new AbortController().signal);
      const bodyStopped = assert.rejects(collect(active.body));
      const queuedStopped = assert.rejects(
        raw.get(new URL(base + '/queued'), {}, new AbortController().signal),
      );
      raw.close();
      await Promise.all([bodyStopped, queuedStopped]);
      await assert.rejects(raw.get(new URL(base), {}, new AbortController().signal), /closed/);
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(calls, 1);
      active.dispose();
    } finally {
      raw.close();
      await close(server);
    }
  },
);
await check('pre-cancellation and unsupported protocols refuse without transmission', async () => {
  const raw = createRawHttpTransport(HttpConfigurationSchema.parse({}));
  try {
    const controller = new AbortController();
    controller.abort(new Error('before send'));
    await assert.rejects(
      raw.get(new URL('http://127.0.0.1:1/'), {}, controller.signal),
      /before send/,
    );
    await assert.rejects(
      raw.get(new URL('ftp://example.invalid/'), {}, new AbortController().signal),
      /Unsupported HTTP protocol/,
    );
  } finally {
    raw.close();
  }
});
await check('received prefix drains after abort even when consumption attaches late', async () => {
  const prefix = Buffer.alloc(65536, 7);
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-length': prefix.length * 2 });
    response.write(prefix);
    setTimeout(() => response.destroy(), 20);
  });
  const base = await listen(server),
    raw = createRawHttpTransport(HttpConfigurationSchema.parse({}));
  try {
    const response = await raw.get(new URL(base), {}, new AbortController().signal);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const chunks: Uint8Array[] = [];
    await assert.rejects(async () => {
      for await (const chunk of response.body) chunks.push(chunk);
    }, /aborted/);
    assert.deepEqual(Buffer.concat(chunks), prefix);
    response.dispose();
  } finally {
    raw.close();
    await close(server);
  }
});
await check('returning an unstarted body iterator releases its connection', async () => {
  const server = createServer((request, response) => {
    response.writeHead(200);
    response.write('prefix');
    if (request.url === '/two') response.end('done');
  });
  const base = await listen(server),
    raw = createRawHttpTransport(HttpConfigurationSchema.parse({ perOriginConcurrency: 1 }));
  try {
    const first = await raw.get(new URL(base + '/one'), {}, new AbortController().signal);
    const iterator = first.body[Symbol.asyncIterator]();
    assert(iterator.return);
    await iterator.return();
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 1000);
    try {
      const second = await raw.get(new URL(base + '/two'), {}, controller.signal);
      assert.equal((await collect(second.body)).toString(), 'prefixdone');
      second.dispose();
    } finally {
      clearTimeout(timer);
      first.dispose();
    }
  } finally {
    raw.close();
    await close(server);
  }
});
process.stdout.write('Raw HTTP transport: ' + passed + ' groups passed.\n');
