import { Agent as HttpAgent, request as httpRequest } from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import type { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { Socket } from 'node:net';
import { OperationFailure } from '../engine/control.js';

import { HttpConfigurationSchema, type HttpConfiguration } from './http.schema.js';
export type HttpResponse = {
  status: number;
  headers: Headers;
  body: AsyncIterable<Uint8Array>;
  rawHeaders: string[];
  dispose(): void;
};
export interface RawHttpTransport {
  get(url: URL, headers: Record<string, string>, signal: AbortSignal): Promise<HttpResponse>;
  post(
    url: URL,
    headers: Record<string, string>,
    body: string,
    signal: AbortSignal,
  ): Promise<HttpResponse>;
  close(): void;
}
const receivedBody = (stream: Readable): AsyncIterable<unknown> => {
  let terminal = false,
    failed = false,
    failure: unknown;
  let wake: () => void = () => {};
  // The standard async iterator rejects before draining bytes buffered at abort.
  // Observe termination now; pull retained bytes before exposing that cause.
  void finished(stream, { cleanup: true }).then(
    () => {
      terminal = true;
      wake();
    },
    (error) => {
      terminal = true;
      failed = true;
      failure = error;
      wake();
    },
  );
  const iterate = async function* (): AsyncGenerator<unknown, void, unknown> {
    try {
      for (;;) {
        const chunk: unknown = stream.read();
        if (chunk !== null) {
          yield chunk;
          continue;
        }
        if (terminal) {
          if (failed) throw failure;
          return;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
          stream.once('readable', wake);
          if (stream.readableLength > 0 || terminal) wake();
        });
        stream.removeListener('readable', wake);
        wake = () => {};
      }
    } finally {
      stream.removeListener('readable', wake);
      if (!stream.readableEnded) stream.destroy();
    }
  };
  let consumed = false;
  return {
    [Symbol.asyncIterator](): AsyncIterator<unknown> {
      if (consumed) throw new Error('HTTP response body already consumed');
      consumed = true;
      const iterator = iterate();
      return {
        next: () => iterator.next(),
        async return(): Promise<IteratorResult<unknown>> {
          stream.destroy();
          await iterator.return();
          return { done: true, value: undefined };
        },
      };
    },
  };
};
const checkedBody = (
  source: AsyncIterable<unknown>,
  timeoutMs: number,
  abort: (error: Error) => void,
): AsyncIterable<Uint8Array> => ({
  [Symbol.asyncIterator]: () => {
    const iterator = source[Symbol.asyncIterator]();
    return {
      next: async () => {
        const timer = setTimeout(
          () => abort(new OperationFailure('HTTP_TIMEOUT', 'HTTP body idle timeout')),
          timeoutMs,
        );
        try {
          const result = await iterator.next();
          if (result.done) return { done: true, value: undefined };
          const value: unknown = result.value;
          if (!(value instanceof Uint8Array))
            throw new Error('HTTP response emitted non-byte data');
          return { done: false, value };
        } finally {
          clearTimeout(timer);
        }
      },
      return: async () => {
        if (iterator.return) await iterator.return();
        return { done: true, value: undefined };
      },
    };
  },
});
export const createRawHttpTransport = (configuration: HttpConfiguration): RawHttpTransport => {
  const config = HttpConfigurationSchema.parse(configuration);
  const lifecycle = new AbortController();
  let closed = false;
  const options = {
    keepAlive: true,
    maxSockets: config.perOriginConcurrency,
    maxFreeSockets: config.perOriginConcurrency,
    timeout: config.idleTimeoutMs,
  };
  const http = new HttpAgent(options);
  const https = new HttpsAgent(options);
  const idle = new Map<Socket, true>();
  const tracked = new WeakSet<Socket>();
  const rememberIdle = (socket: Socket): void => {
    if (socket.destroyed) return;
    idle.delete(socket);
    idle.set(socket, true);
    while (idle.size > config.maxIdleSockets) {
      const oldest = idle.keys().next().value;
      if (!oldest) break;
      idle.delete(oldest);
      oldest.destroy();
    }
  };
  http.on('free', rememberIdle);
  https.on('free', rememberIdle);
  const send = async (
    method: 'GET' | 'POST',
    inputUrl: URL,
    inputHeaders: Record<string, string>,
    body: string | null,
    signal: AbortSignal,
  ): Promise<HttpResponse> => {
    if (closed) throw new Error('HTTP transport closed');
    const url = new URL(inputUrl.href);
    const headers = { ...inputHeaders };
    if (!['http:', 'https:'].includes(url.protocol))
      throw new Error('Unsupported HTTP protocol: ' + url.protocol);
    signal.throwIfAborted();
    return new Promise<HttpResponse>((done, reject) => {
      const outgoing = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
        method,
        headers,
        signal: AbortSignal.any([signal, lifecycle.signal]),
        agent: url.protocol === 'https:' ? https : http,
      });
      const timer = setTimeout(
        () => outgoing.destroy(new OperationFailure('HTTP_TIMEOUT', 'HTTP headers timed out')),
        config.headerTimeoutMs,
      );
      outgoing.once('socket', (socket) => {
        idle.delete(socket);
        if (!tracked.has(socket)) {
          tracked.add(socket);
          socket.once('close', () => idle.delete(socket));
        }
      });
      outgoing.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      outgoing.once('response', (incoming) => {
        clearTimeout(timer);

        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) for (const part of value) responseHeaders.append(key, part);
          else if (value !== undefined) responseHeaders.set(key, value);
        }
        try {
          done({
            status: incoming.statusCode ?? 0,
            headers: responseHeaders,
            rawHeaders: [...incoming.rawHeaders],
            body: checkedBody(receivedBody(incoming), config.idleTimeoutMs, (error) =>
              incoming.destroy(error),
            ),
            dispose: () => {
              if (!incoming.complete || !incoming.readableEnded) {
                incoming.destroy();
                outgoing.destroy();
              }
            },
          });
        } catch (error) {
          incoming.destroy();
          outgoing.destroy();
          reject(error);
        }
      });
      if (body === null) outgoing.end();
      else outgoing.end(body);
    });
  };
  return {
    get: (url, headers, signal) => send('GET', url, headers, null, signal),
    post: (url, headers, body, signal) => send('POST', url, headers, body, signal),
    close: () => {
      if (closed) return;
      closed = true;
      lifecycle.abort(new Error('HTTP transport closed'));
      idle.clear();
      http.destroy();
      https.destroy();
    },
  };
};
