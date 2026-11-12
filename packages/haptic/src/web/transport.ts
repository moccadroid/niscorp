import { z } from 'zod';
import { RunControl, OperationFailure } from '../engine/control.js';
import { createRawHttpTransport, type HttpResponse } from '../connector/http-transport.endpoint.js';
import { HttpConfigurationSchema } from '../connector/http.schema.js';
import { decodeHttpContent } from '../connector/http-content-core.js';
import { captureBody, type HttpSource } from './source.js';
import defaults from './default-profile.json' with { type: 'json' };

export const WebTransportProfileSchema = z
  .object({
    requestHeaders: z.record(z.string(), z.string()).default(defaults.requestHeaders),
    transport: HttpConfigurationSchema.default(HttpConfigurationSchema.parse({})),
    maxEncodedBytes: z.number().int().positive().default(defaults.maxEncodedBytes),
    maxDecodedBytes: z.number().int().positive().default(defaults.maxDecodedBytes),
    maxDecodeWorkBytes: z.number().int().positive().default(defaults.maxDecodeWorkBytes),
    maxContentEncodings: z.number().int().nonnegative().default(defaults.maxContentEncodings),
  })
  .strict();
export type WebTransportProfile = z.input<typeof WebTransportProfileSchema>;

export interface WebTransport {
  get(url: string, signal: AbortSignal): Promise<HttpSource>;
  // A form POST with exactly these headers (the profile's request headers are not added).
  post(
    url: string,
    headers: Record<string, string>,
    body: string,
    signal: AbortSignal,
  ): Promise<HttpSource>;
  close(): void;
}

const networkErrors = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);
const rethrowHttpFailure = (error: unknown): never => {
  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    networkErrors.has(error.code)
  ) {
    throw new OperationFailure('HTTP_TRANSPORT', error.code + ': ' + error.message);
  }
  throw error;
};

// One request per call; redirects are returned, not followed.
export const createWebTransport = (input: WebTransportProfile = {}): WebTransport => {
  const options = WebTransportProfileSchema.parse(input);
  const transport = createRawHttpTransport(options.transport);
  const receive = async (
    url: string,
    sent: Promise<HttpResponse>,
    signal: AbortSignal,
  ): Promise<HttpSource> => {
    const response = await sent.catch(rethrowHttpFailure);
    try {
      const parts: Uint8Array[] = [];
      let bytes = 0;
      for await (const part of response.body) {
        signal.throwIfAborted();
        bytes += part.byteLength;
        if (bytes > options.maxEncodedBytes)
          throw new RunControl('HTTP_BYTES', 'Encoded HTTP body limit exceeded');
        parts.push(part);
      }
      signal.throwIfAborted();
      const encoded = Buffer.concat(parts);
      const headers: Record<string, string[]> = {};
      const raw = response.rawHeaders;
      for (let i = 0; i < raw.length; i += 2) {
        const name = raw[i]?.toLowerCase();
        const value = raw[i + 1];
        if (name !== undefined && value !== undefined)
          headers[name] = [...(headers[name] ?? []), value];
      }
      const codings = (response.headers.get('content-encoding') ?? '')
        .split(',')
        .filter((value) => value.trim());
      if (codings.length > options.maxContentEncodings)
        throw new RunControl('HTTP_CODINGS', 'Content coding count exceeded');
      const body = decodeHttpContent(
        encoded,
        codings,
        options.maxDecodedBytes,
        options.maxDecodeWorkBytes,
      );
      signal.throwIfAborted();
      return {
        url,
        status: response.status,
        headers,
        encoded: captureBody(encoded),
        body: captureBody(body),
      };
    } catch (error) {
      return rethrowHttpFailure(error);
    } finally {
      response.dispose();
    }
  };
  return {
    get: (url, signal) =>
      receive(url, transport.get(new URL(url), { ...options.requestHeaders }, signal), signal),
    post: (url, headers, body, signal) =>
      receive(url, transport.post(new URL(url), { ...headers }, body, signal), signal),
    close: transport.close,
  };
};
