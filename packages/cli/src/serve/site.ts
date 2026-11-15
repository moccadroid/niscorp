import { constants, createBrotliCompress, createGzip } from 'node:zlib';
import type { BrotliCompress, Gzip } from 'node:zlib';

export type SiteHandler<Rest extends readonly unknown[] = []> = (request: Request, ...rest: Rest) => Response | Promise<Response>;

export type SiteOptions = {
  except?: RegExp;
};

const KEPT_PATHS = /^\/assets\//;
const KEPT_FOREVER = 'public, max-age=31536000, immutable';

export const withCaching =
  <Rest extends readonly unknown[]>(handler: SiteHandler<Rest>, options: SiteOptions = {}): SiteHandler<Rest> =>
  async (request, ...rest) => {
    const response = await handler(request, ...rest);
    if ((request.method !== 'GET' && request.method !== 'HEAD') || response.status !== 200) return response;
    const path = new URL(request.url).pathname;
    if (options.except?.test(path) === true) return response;
    if (response.headers.has('cache-control')) return response;

    const headers = new Headers(response.headers);
    if (KEPT_PATHS.test(path)) {
      headers.set('cache-control', KEPT_FOREVER);
      return new Response(response.body, { status: 200, headers });
    }
    headers.set('cache-control', 'no-cache');
    const [since, modified] = [request.headers.get('if-modified-since'), headers.get('last-modified')];
    if (since !== null && modified !== null && Date.parse(since) >= Date.parse(modified)) {
      await response.body?.cancel();
      headers.delete('content-length');
      return new Response(null, { status: 304, headers });
    }
    return new Response(response.body, { status: 200, headers });
  };

const COMPRESSIBLE = /^(text\/(?!event-stream)|application\/(json|javascript|xml|manifest\+json|wasm)|image\/svg\+xml)/i;
const SMALL_BYTES = 1024;
// fast enough to do per answer, and already smaller than gzip's best
const BROTLI_QUALITY = 5;

type Encoding = 'br' | 'gzip';

const encodingFor = (header: string | null): Encoding | undefined => {
  const offered = new Map<string, number>();
  for (const part of (header ?? '').toLowerCase().split(',')) {
    const [name = '', ...parameters] = part.split(';').map((piece) => piece.trim());
    const weight = parameters.find((parameter) => parameter.startsWith('q='));
    if (name !== '') offered.set(name, weight === undefined ? 1 : Number(weight.slice(2)));
  }
  if ((offered.get('br') ?? 0) > 0) return 'br';
  if ((offered.get('gzip') ?? 0) > 0) return 'gzip';
  return undefined;
};

// Flushed after every piece written: that is what keeps a streamed answer streaming.
const compressorFor = (encoding: Encoding): BrotliCompress | Gzip =>
  encoding === 'br'
    ? createBrotliCompress({ flush: constants.BROTLI_OPERATION_FLUSH, params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } })
    : createGzip({ flush: constants.Z_SYNC_FLUSH });

const compressedBody = (source: ReadableStream<Uint8Array>, encoding: Encoding, whole?: (bytes: Buffer<ArrayBuffer>) => void): ReadableStream<Uint8Array> => {
  const reader = source.getReader();
  const compressor = compressorFor(encoding);
  const pieces: Buffer[] = [];
  let isLetGo = false;
  let finished: () => void = () => undefined;
  const ended = new Promise<void>((done) => {
    finished = done;
  });
  return new ReadableStream<Uint8Array>({
    start: (controller) => {
      compressor.on('data', (piece: Buffer) => {
        if (isLetGo) return;
        if (whole !== undefined) pieces.push(piece);
        controller.enqueue(piece);
      });
      compressor.on('end', () => {
        if (!isLetGo) {
          whole?.(Buffer.concat(pieces));
          controller.close();
        }
        finished();
      });
      compressor.on('error', (error) => {
        if (!isLetGo) controller.error(error);
        finished();
      });
    },
    pull: async () => {
      const { done, value } = await reader.read().catch((error: unknown) => {
        compressor.destroy();
        throw error;
      });
      if (done) {
        compressor.end();
        return ended;
      }
      return new Promise<void>((taken) => {
        compressor.write(value, () => taken());
      });
    },
    cancel: async (reason) => {
      isLetGo = true;
      compressor.destroy();
      await reader.cancel(reason);
    },
  });
};

export const withCompression = <Rest extends readonly unknown[]>(handler: SiteHandler<Rest>, options: SiteOptions = {}): SiteHandler<Rest> => {
  // No eviction: only an answer that says it will never change is remembered,
  // which is bounded by what the built folder holds under assets/.
  const remembered = new Map<string, Buffer<ArrayBuffer>>();
  return async (request, ...rest) => {
    const response = await handler(request, ...rest);
    if (request.method !== 'GET' || response.status !== 200 || response.body === null) return response;
    const path = new URL(request.url).pathname;
    if (options.except?.test(path) === true) return response;
    if (!COMPRESSIBLE.test(response.headers.get('content-type') ?? '')) return response;
    if (response.headers.has('content-encoding') || /no-transform/i.test(response.headers.get('cache-control') ?? '')) return response;

    // From here the answer depends on what was asked for, compressed or not: a
    // cache has to be told.
    const headers = new Headers(response.headers);
    const varies = (headers.get('vary') ?? '').toLowerCase().split(',').map((name) => name.trim());
    if (!varies.includes('accept-encoding')) headers.append('vary', 'Accept-Encoding');

    const encoding = encodingFor(request.headers.get('accept-encoding'));
    const length = headers.get('content-length');
    if (encoding === undefined || (length !== null && Number(length) < SMALL_BYTES)) return new Response(response.body, { status: 200, headers });

    headers.set('content-encoding', encoding);
    headers.delete('content-length');
    // A strong etag promises the exact bytes, and compression changes them.
    const etag = headers.get('etag');
    if (etag !== null && !etag.startsWith('W/')) headers.set('etag', `W/${etag}`);

    if (!/\bimmutable\b/i.test(headers.get('cache-control') ?? '')) return new Response(compressedBody(response.body, encoding), { status: 200, headers });
    const key = `${encoding} ${path} ${headers.get('last-modified') ?? ''}`;
    const known = remembered.get(key);
    if (known === undefined) return new Response(compressedBody(response.body, encoding, (bytes) => remembered.set(key, bytes)), { status: 200, headers });
    await response.body.cancel();
    headers.set('content-length', String(known.length));
    return new Response(known, { status: 200, headers });
  };
};

export const siteHandler = <Rest extends readonly unknown[]>(handler: SiteHandler<Rest>, options: SiteOptions = {}): SiteHandler<Rest> =>
  withCompression(withCaching(handler, options), options);
