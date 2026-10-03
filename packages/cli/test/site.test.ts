import { brotliDecompressSync, createBrotliDecompress, gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { siteHandler, withCaching, withCompression } from '../src/site';
import type { SiteHandler } from '../src/site';

// ═══════════════════════════════════════════════════════════════
// What `nisc start` puts around an app, against handlers made up for each rule:
// what a browser may keep, and how an answer travels.
// ═══════════════════════════════════════════════════════════════

const WHEN = 'Sat, 03 Oct 2026 12:00:00 GMT';
const LONG = 'nisc '.repeat(2000);
const BROWSER = { 'accept-encoding': 'gzip, deflate, br, zstd' };

const answer =
  (init: { type?: string; status?: number; headers?: Record<string, string>; body?: BodyInit | null } = {}): SiteHandler =>
  () =>
    new Response(init.body === undefined ? LONG : init.body, {
      status: init.status ?? 200,
      headers: { ...(init.type !== undefined ? { 'content-type': init.type } : {}), ...init.headers },
    });

const get = (path: string, headers: Record<string, string> = {}, method = 'GET'): Request => new Request(`http://localhost${path}`, { method, headers });
const bytesOf = async (response: Response): Promise<Buffer> => Buffer.from(await response.arrayBuffer());

describe('withCaching — what a browser may keep', () => {
  const file = answer({ type: 'text/javascript', headers: { 'last-modified': WHEN } });
  const options = { except: /^\/api(\/|$)/ };

  it('what the bundler wrote under assets/ is kept for a year and not asked about again', async () => {
    const response = await withCaching(file, options)(get('/assets/index-AbC12345.js'));
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await response.text()).toBe(LONG);
  });

  it('any other file is asked about each time — and answered 304, empty, when it has not changed', async () => {
    const first = await withCaching(file, options)(get('/robots.txt'));
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('no-cache');

    const same = await withCaching(file, options)(get('/robots.txt', { 'if-modified-since': WHEN }));
    expect(same.status).toBe(304);
    expect(same.headers.get('cache-control')).toBe('no-cache');
    expect(same.headers.get('last-modified')).toBe(WHEN);
    expect(same.headers.has('content-length')).toBe(false);
    expect((await bytesOf(same)).length).toBe(0);

    const changed = await withCaching(file, options)(get('/robots.txt', { 'if-modified-since': 'Sat, 03 Oct 2026 11:00:00 GMT' }));
    expect(changed.status).toBe(200);
    expect(await changed.text()).toBe(LONG);
  });

  it('a file that does not say when it changed is sent each time', async () => {
    const undated = answer({ type: 'text/plain' });
    const response = await withCaching(undated)(get('/robots.txt', { 'if-modified-since': WHEN }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });

  it('an answer that says for itself is not overruled — not even under assets/', async () => {
    const drawn = answer({ type: 'text/html', headers: { 'cache-control': 'private, no-store', vary: 'Cookie' } });
    const response = await withCaching(drawn)(get('/assets/index-AbC12345.js'));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('leaves alone the app server’s own paths, anything not asked for with GET or HEAD, and anything but a 200', async () => {
    expect((await withCaching(file, options)(get('/api/todos/vex'))).headers.has('cache-control')).toBe(false);
    expect((await withCaching(file, options)(get('/assets/x.js', {}, 'POST'))).headers.has('cache-control')).toBe(false);
    const missing = await withCaching(answer({ status: 404, body: 'not found' }))(get('/assets/gone.js'));
    expect(missing.status).toBe(404);
    expect(missing.headers.has('cache-control')).toBe(false);
    const part = await withCaching(answer({ status: 206, headers: { 'last-modified': WHEN } }))(get('/assets/x.js'));
    expect(part.headers.has('cache-control')).toBe(false);
  });
});

describe('withCompression — how an answer travels', () => {
  const html = answer({ type: 'text/html; charset=utf-8' });

  it('brotli when the asker takes it, gzip when that is all it takes, as it is when it takes neither', async () => {
    const br = await withCompression(html)(get('/', BROWSER));
    expect(br.headers.get('content-encoding')).toBe('br');
    expect(br.headers.has('content-length')).toBe(false);
    const brBytes = await bytesOf(br);
    expect(brBytes.length).toBeLessThan(LONG.length / 10);
    expect(brotliDecompressSync(brBytes).toString()).toBe(LONG);

    const gz = await withCompression(html)(get('/', { 'accept-encoding': 'gzip, deflate' }));
    expect(gz.headers.get('content-encoding')).toBe('gzip');
    expect(gunzipSync(await bytesOf(gz)).toString()).toBe(LONG);

    const plain = await withCompression(html)(get('/'));
    expect(plain.headers.has('content-encoding')).toBe(false);
    expect(await plain.text()).toBe(LONG);
    // …but it would have been different had it been asked for differently
    expect(plain.headers.get('vary')).toBe('Accept-Encoding');
  });

  it('q=0 is a refusal', async () => {
    const response = await withCompression(html)(get('/', { 'accept-encoding': 'br;q=0, gzip;q=0.5' }));
    expect(response.headers.get('content-encoding')).toBe('gzip');
  });

  it('a page that already depends on the cookie depends on both', async () => {
    const response = await withCompression(answer({ type: 'text/html', headers: { vary: 'Cookie' } }))(get('/', BROWSER));
    expect(response.headers.get('vary')).toBe('Cookie, Accept-Encoding');
    const again = await withCompression(answer({ type: 'text/html', headers: { vary: 'Accept-Encoding' } }))(get('/', BROWSER));
    expect(again.headers.get('vary')).toBe('Accept-Encoding');
  });

  it('a strong ETag becomes a weak one: the bytes are no longer those bytes', async () => {
    const response = await withCompression(answer({ type: 'text/css', headers: { etag: '"abc"' } }))(get('/kit.css', BROWSER));
    expect(response.headers.get('etag')).toBe('W/"abc"');
  });

  it.each([
    ['a font', answer({ type: 'font/woff2' }), 'GET', '/assets/f.woff2'],
    ['an image', answer({ type: 'image/png' }), 'GET', '/og.png'],
    ['an event stream', answer({ type: 'text/event-stream' }), 'GET', '/events'],
    ['an answer that says no-transform', answer({ type: 'text/html', headers: { 'cache-control': 'no-transform' } }), 'GET', '/'],
    ['a 304', answer({ type: 'text/html', status: 304, body: null }), 'GET', '/'],
    ['a 206', answer({ type: 'text/html', status: 206 }), 'GET', '/'],
    ['a 404', answer({ type: 'text/plain', status: 404 }), 'GET', '/nope'],
    ['a HEAD', answer({ type: 'text/html' }), 'HEAD', '/'],
    ['a path the app server answers itself', answer({ type: 'application/json' }), 'GET', '/api/todos/vex'],
  ] as const)('%s is left exactly as it was', async (_name, handler, method, path) => {
    const response = await withCompression(handler, { except: /^\/api(\/|$)/ })(get(path, BROWSER, method));
    expect(response.headers.has('content-encoding')).toBe(false);
    expect(response.headers.has('vary')).toBe(false);
  });

  it('an answer already compressed is not compressed again', async () => {
    const response = await withCompression(answer({ type: 'text/html', headers: { 'content-encoding': 'gzip' } }))(get('/', BROWSER));
    expect(response.headers.get('content-encoding')).toBe('gzip');
    expect(await response.text()).toBe(LONG);
  });

  it('an answer known to be small is not worth it', async () => {
    const small = answer({ type: 'image/svg+xml', body: '<svg/>', headers: { 'content-length': '6' } });
    const response = await withCompression(small)(get('/favicon.svg', BROWSER));
    expect(response.headers.has('content-encoding')).toBe(false);
    expect(await response.text()).toBe('<svg/>');
  });

  it('an answer that streams still streams: each piece goes out as it is produced', async () => {
    let sent = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const source = new ReadableStream<Uint8Array>({
      start: (controller) => {
        timer = setInterval(() => {
          sent += 1;
          controller.enqueue(new TextEncoder().encode(`piece ${sent}\n`));
          if (sent === 5) {
            clearInterval(timer);
            controller.close();
          }
        }, 60);
      },
      cancel: () => clearInterval(timer),
    });
    const response = await withCompression(() => new Response(source, { headers: { 'content-type': 'text/plain' } }))(get('/words', BROWSER));
    expect(response.headers.get('content-encoding')).toBe('br');

    // read it the way a browser does: decompressing as it arrives
    const decompress = createBrotliDecompress();
    const arrived: { text: string; sentByThen: number }[] = [];
    decompress.on('data', (piece: Buffer) => arrived.push({ text: piece.toString(), sentByThen: sent }));
    const reader = response.body?.getReader();
    for (;;) {
      const next = await reader?.read();
      if (next === undefined || next.done) break;
      decompress.write(next.value);
    }
    await new Promise<void>((done) => decompress.end(() => done()));

    expect(arrived.map((piece) => piece.text).join('')).toBe('piece 1\npiece 2\npiece 3\npiece 4\npiece 5\n');
    // the first piece was readable before the last was even produced
    expect(arrived[0]?.text).toContain('piece 1');
    expect(arrived[0]?.sentByThen).toBeLessThan(5);
  });

  it('an answer that will never change is compressed once', async () => {
    // the inner answer's body, let go unread: what happens to it when the
    // compressed bytes are already known
    let letGo = 0;
    const asset: SiteHandler = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start: (controller) => {
            controller.enqueue(new TextEncoder().encode(LONG));
            controller.close();
          },
          cancel: () => {
            letGo += 1;
          },
        }),
        { headers: { 'content-type': 'text/javascript', 'cache-control': 'public, max-age=31536000, immutable', 'last-modified': WHEN } },
      );
    const handler = withCompression(asset);

    const first = await handler(get('/assets/index-AbC12345.js', BROWSER));
    // compressed as it is read: how long it will be is not known yet
    expect(first.headers.has('content-length')).toBe(false);
    const firstBytes = await bytesOf(first);
    expect(brotliDecompressSync(firstBytes).toString()).toBe(LONG);

    const second = await handler(get('/assets/index-AbC12345.js', BROWSER));
    expect(second.headers.get('content-encoding')).toBe('br');
    // what was remembered goes out whole, with its length
    expect(second.headers.get('content-length')).toBe(String(firstBytes.length));
    expect((await bytesOf(second)).equals(firstBytes)).toBe(true);

    // asked for differently, it is a different answer
    const gz = await handler(get('/assets/index-AbC12345.js', { 'accept-encoding': 'gzip' }));
    expect(gz.headers.has('content-length')).toBe(false);
    expect(gunzipSync(await bytesOf(gz)).toString()).toBe(LONG);
    // of the three, only the second had nothing to read the inner answer for
    expect(letGo).toBe(1);
  });

  it('…and only once it has gone out whole: an answer cut short is not remembered', async () => {
    const asset: SiteHandler = () => new Response(LONG, { headers: { 'content-type': 'text/javascript', 'cache-control': 'public, max-age=31536000, immutable' } });
    const handler = withCompression(asset);
    const cut = await handler(get('/assets/index-AbC12345.js', BROWSER));
    await cut.body?.cancel();
    const next = await handler(get('/assets/index-AbC12345.js', BROWSER));
    // nothing was remembered, so this one is compressed as it is read too
    expect(next.headers.has('content-length')).toBe(false);
    expect(brotliDecompressSync(await bytesOf(next)).toString()).toBe(LONG);
  });
});

describe('withCompression — an answer that does not finish', () => {
  // a source that produces a piece every 20ms until it is stopped, or told to fail
  const slow = (failAt?: number): { handler: SiteHandler; sent: () => number; stopped: () => boolean } => {
    let sent = 0;
    let isStopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const source = new ReadableStream<Uint8Array>({
      start: (controller) => {
        timer = setInterval(() => {
          sent += 1;
          if (sent === failAt) {
            clearInterval(timer);
            controller.error(new Error('the source broke'));
            return;
          }
          controller.enqueue(new TextEncoder().encode(`piece ${sent} ${'x'.repeat(200)}\n`));
        }, 20);
      },
      cancel: () => {
        isStopped = true;
        clearInterval(timer);
      },
    });
    return { handler: () => new Response(source, { headers: { 'content-type': 'text/plain' } }), sent: () => sent, stopped: () => isStopped };
  };

  it('a reader that stops reading stops the handler’s answer too, and nothing is thrown after it', async () => {
    const thrown: unknown[] = [];
    const hear = (error: unknown): void => void thrown.push(error);
    process.on('uncaughtException', hear);
    try {
      const { handler, stopped } = slow();
      const response = await withCompression(handler)(get('/words', BROWSER));
      const reader = response.body?.getReader();
      await reader?.read();
      await reader?.cancel();
      expect(stopped()).toBe(true);
      // long enough for anything still in flight to land
      await new Promise((done) => setTimeout(done, 120));
      expect(thrown).toEqual([]);
    } finally {
      process.off('uncaughtException', hear);
    }
  });

  it('a source that fails fails the answer — heard by whoever is reading, not thrown at the process', async () => {
    const thrown: unknown[] = [];
    const hear = (error: unknown): void => void thrown.push(error);
    process.on('uncaughtException', hear);
    try {
      const { handler } = slow(3);
      const response = await withCompression(handler)(get('/words', BROWSER));
      await expect(response.arrayBuffer()).rejects.toThrow('the source broke');
      await new Promise((done) => setTimeout(done, 60));
      expect(thrown).toEqual([]);
    } finally {
      process.off('uncaughtException', hear);
    }
  });
});

describe('siteHandler — both, around one handler', () => {
  it('an asset is kept and compressed; a document keeps what it said and is compressed', async () => {
    const handler = siteHandler((request) =>
      new URL(request.url).pathname === '/'
        ? new Response(LONG, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', vary: 'Cookie' } })
        : new Response(LONG, { headers: { 'content-type': 'text/javascript', 'last-modified': WHEN } }),
    );
    const asset = await handler(get('/assets/index-AbC12345.js', BROWSER));
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(asset.headers.get('content-encoding')).toBe('br');

    const document = await handler(get('/', BROWSER));
    expect(document.headers.get('cache-control')).toBe('no-cache');
    expect(document.headers.get('vary')).toBe('Cookie, Accept-Encoding');
    expect(brotliDecompressSync(await bytesOf(document)).toString()).toBe(LONG);
  });

  it('a file that has not changed is a 304 with nothing in it, compressed or not', async () => {
    const handler = siteHandler(answer({ type: 'text/plain', headers: { 'last-modified': WHEN } }));
    const response = await handler(get('/robots.txt', { ...BROWSER, 'if-modified-since': WHEN }));
    expect(response.status).toBe(304);
    expect((await bytesOf(response)).length).toBe(0);
  });

  it('hands the handler whatever else the listener handed over', async () => {
    const seen: unknown[] = [];
    const inner: SiteHandler<[env: { incoming: string }]> = (_request, env) => {
      seen.push(env);
      return new Response('ok', { headers: { 'content-type': 'text/plain' } });
    };
    await siteHandler(inner)(get('/'), { incoming: 'the node request' });
    expect(seen).toEqual([{ incoming: 'the node request' }]);
  });
});
