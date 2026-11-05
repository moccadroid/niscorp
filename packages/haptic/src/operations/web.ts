import { z } from 'zod';
import type { JsonValue, Operations } from '../engine/contracts.js';
import { defineOperation } from '../engine/operation.js';
import { createJsonReadOperation } from './json.js';
import { createUrlOperations } from './url.js';
import { createXmlOperations } from './xml.js';
import { RunControl, OperationFailure } from '../engine/control.js';
import { createRawHttpTransport } from '../connector/http-transport.endpoint.js';
import { HttpConfigurationSchema } from '../connector/http.schema.js';
import engineProfile from '../engine/default-profile.json' with { type: 'json' };
import defaults from './default-profile.json' with { type: 'json' };
import { decodeHttpContent } from '../connector/http-content-core.js';
import { HttpSourceSchema, captureBody, readSourceBody } from './http-source.js';
import {
  createHtmlStructure,
  decodeHtmlSource,
  effectiveHtmlBase,
  resolveHtmlUrl,
  readHtmlProfile,
  HtmlSelectorError,
  HtmlFieldsSchema,
  HtmlFieldError,
  readHtmlFields,
} from '../readers/html/index.js';
const getSchema = z
  .object({
    url: z.url().describe('HTTP or HTTPS URL; redirects are returned, not automatically followed.'),
    headers: z
      .record(z.string(), z.string())
      .default({})
      .describe('Explicit request headers; override HTTP profile defaults case-insensitively.'),
  })
  .strict();
const selectSchema = z
  .object({
    source: HttpSourceSchema.describe(
      'Complete HTTP response containing content-decoded body bytes.',
    ),
    selector: z
      .string()
      .min(1)
      .describe('CSS selector supplied by the artifact, including any content scoping.'),
    fields: HtmlFieldsSchema.nullable().optional(),
  })
  .strict();
export const HtmlSelectedItemSchema = z
  .object({
    text: z
      .string()
      .describe(
        'Selected element text including descendant text, excluding inert script/style/template/noscript content; whitespace is preserved.',
      ),
    attributes: z
      .record(z.string(), z.string())
      .describe('Parsed source attributes on this selected element, such as href on an anchor.'),
    path: z
      .array(z.number().int())
      .describe('Zero-based child-node ordinals identifying the selected source element.'),
    fields: z.record(z.string(), z.array(z.string().nullable())).optional(),
  })
  .strict();
const selectionSchema = z
  .object({
    baseUrl: z.string().describe('Effective base URL for relative links in the selected document.'),
    encoding: z.string().describe('Character encoding used to decode the source.'),
    items: z.array(HtmlSelectedItemSchema),
  })
  .strict();
const resolveSchema = z
  .object({
    value: z.string().describe('Raw relative or absolute URL.'),
    base: z.url().describe('Effective source base URL.'),
    encoding: z
      .string()
      .default(readHtmlProfile().base.urlEncoding)
      .describe('Source encoding for legacy-query refusal.'),
  })
  .strict();
const collectSchema = resolveSchema
  .omit({ value: true })
  .extend({
    values: z
      .array(z.string().nullable())
      .describe('URL references in source order; null marks a missing reference.'),
    limit: z.number().int().positive().describe('Stop after this many distinct resolved URLs.'),
    exclude: z
      .array(z.string())
      .default([])
      .describe('Resolved URLs to exclude before applying the collection limit.'),
    stripFragments: z.boolean().describe('Remove URL fragments before comparing distinct URLs.'),
  })
  .strict();
const resolveReference = (value: string, base: string, encoding: string): URL => {
  try {
    return resolveHtmlUrl(value, base, encoding);
  } catch (error) {
    if (error instanceof TypeError && 'code' in error && error.code === 'ERR_INVALID_URL')
      throw new OperationFailure('URL_INVALID', 'Invalid URL reference: ' + value);
    throw error;
  }
};
export const WebProfileSchema = z
  .object({
    requestHeaders: z
      .record(z.string(), z.string())
      .default(defaults.requestHeaders)
      .describe(
        'Default headers for HTTP requests. Per-request headers override by name; {} disables these defaults.',
      ),
    maxJsonDepth: z.number().int().positive().default(engineProfile.maxJsonDepth),
    transport: HttpConfigurationSchema.default(HttpConfigurationSchema.parse({})),
    maxEncodedBytes: z.number().int().positive().default(defaults.maxEncodedBytes),
    maxDecodedBytes: z.number().int().positive().default(defaults.maxDecodedBytes),
    maxDecodeWorkBytes: z.number().int().positive().default(defaults.maxDecodeWorkBytes),
    maxContentEncodings: z.number().int().nonnegative().default(defaults.maxContentEncodings),
    maxSelectedItems: z.number().int().positive().default(defaults.maxSelectedItems),
    html: z.unknown().optional(),
    xml: z.unknown().optional(),
  })
  .strict();
export type WebProfile = z.input<typeof WebProfileSchema>;
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
// Schemas belong to the adapters; the interpreter knows none of these fields.
export const createWebOperations = (
  input: WebProfile = {},
): {
  operations: Operations;
  close: () => void;
} => {
  const options = WebProfileSchema.parse(input),
    profile = readHtmlProfile(options.html);
  const { maxInputBytes: _maxInputBytes, ...structureLimits } = profile.limits;
  const transport = createRawHttpTransport(options.transport);
  const get = defineOperation({
    maxJsonDepth: options.maxJsonDepth,
    input: getSchema,
    output: HttpSourceSchema,
    async run(request, { signal }): Promise<JsonValue> {
      const headers = new Headers(options.requestHeaders);
      for (const [name, value] of Object.entries(request.headers)) headers.set(name, value);
      const response = await transport
        .get(new URL(request.url), Object.fromEntries(headers), signal)
        .catch(rethrowHttpFailure);
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
        const encoded = Buffer.concat(parts),
          headers: Record<string, string[]> = {};
        const raw = response.rawHeaders;
        for (let i = 0; i < raw.length; i += 2) {
          const name = raw[i]?.toLowerCase(),
            value = raw[i + 1];
          if (name !== undefined && value !== undefined) {
            const values = Object.hasOwn(headers, name) ? (headers[name] ?? []) : [];
            Object.defineProperty(headers, name, {
              value: [...values, value],
              enumerable: true,
              configurable: true,
            });
          }
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
          url: request.url,
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
    },
  });
  const select = defineOperation({
    maxJsonDepth: options.maxJsonDepth,
    input: selectSchema,
    output: selectionSchema,
    run(request, { signal }): JsonValue {
      const bytes = readSourceBody(request.source);
      const decoded = decodeHtmlSource(bytes, request.source.headers, profile);
      const structure = createHtmlStructure(decoded.html, structureLimits, signal);
      const base = effectiveHtmlBase(
        structure,
        request.source.url,
        request.source.headers,
        decoded.encoding,
        profile,
      );
      const matches = (() => {
        try {
          return structure.query(request.selector);
        } catch (error) {
          if (error instanceof HtmlSelectorError)
            throw new OperationFailure('HTML_SELECTOR', error.message);
          throw error;
        }
      })();
      if (matches.length > options.maxSelectedItems)
        throw new RunControl('HTML_ITEMS', 'Selected item limit exceeded');
      const fields = (() => {
        try {
          return request.fields == null
            ? null
            : readHtmlFields(
                structure,
                matches,
                request.fields,
                {
                  maxValues: profile.limits.maxFieldValues,
                  maxBytes: profile.limits.maxFieldBytes,
                },
                signal,
              );
        } catch (error) {
          if (error instanceof HtmlFieldError)
            throw new OperationFailure('HTML_FIELD_MATCHES', error.message);
          if (error instanceof HtmlSelectorError)
            throw new OperationFailure('HTML_SELECTOR', error.message);
          throw error;
        }
      })();
      return {
        baseUrl: base.baseUrl,
        encoding: decoded.encoding,
        items: matches.map((element, index) => ({
          text: structure.textOf(element),
          attributes: { ...element.attribs },
          path: structure.pathOf(element),
          ...(fields === null ? {} : { fields: fields[index] }),
        })),
      };
    },
  });
  const resolve = defineOperation({
    maxJsonDepth: options.maxJsonDepth,
    input: resolveSchema,
    output: z.string(),
    run(request): JsonValue {
      return resolveReference(request.value, request.base, request.encoding).href;
    },
  });
  const collect = defineOperation({
    maxJsonDepth: options.maxJsonDepth,
    input: collectSchema,
    output: z.array(z.string()),
    run(request): JsonValue {
      const urls = new Set<string>();
      const excluded = new Set(request.exclude);
      for (const value of request.values) {
        if (value === null)
          throw new OperationFailure('URL_MISSING', 'Selected element has no URL reference');
        const url = resolveReference(value, request.base, request.encoding);
        if (request.stripFragments) url.hash = '';
        if (excluded.has(url.href)) continue;
        urls.add(url.href);
        if (urls.size === request.limit) break;
      }
      return [...urls];
    },
  });
  return {
    operations: {
      ...createUrlOperations(options.maxJsonDepth),
      ...createXmlOperations(options.xml, options.maxJsonDepth),
      'http.get': get,
      'json.read': createJsonReadOperation(options.maxJsonDepth),
      'html.select': select,
      'url.resolve': resolve,
      'url.collect': collect,
    },
    close: transport.close,
  };
};
