import { createScopeChain, resolve } from '@shared/bindings';
import { hasKey } from '@shared/common';
import type { ScopeChain } from '@shared/bindings';
import type { EndpointConfig, FunctionEndpointConfig, HttpEndpointConfig } from '../schemas';
import type { FetchFn, FetchResponse, FunctionHandler, TransformFn, Unsubscribe } from '../types';

const stringifyForBody = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
};

const resolveHeaders = (
  headers: Record<string, string> | undefined,
  chain: ScopeChain,
): Record<string, string> | undefined => {
  if (headers === undefined) return undefined;
  const out: Record<string, string> = {};
  for (const key of Object.keys(headers)) {
    const value = resolve(headers[key], chain);
    out[key] = typeof value === 'string' ? value : String(value ?? '');
  }
  return out;
};

export type EndpointResult =
  | { ok: true; data: unknown; status: number; onChange?: (handler: (data: unknown) => void) => Unsubscribe }
  | { ok: false; error: { status: number; message: string; data: unknown; aborted?: boolean; timedOut?: boolean } };

const defaultFetch: FetchFn = () => {
  throw new Error('No fetch implementation provided to action runtime');
};

const tryParseJson = async (response: {
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    try {
      return await response.text();
    } catch {
      return undefined;
    }
  }
};

export type CallEndpointOptions = {
  endpoint: EndpointConfig;
  data: Record<string, unknown>;
  fetch?: FetchFn;
  transform?: TransformFn;
  signal?: AbortSignal;
  functions?: Record<string, FunctionHandler>;
  timeoutMs?: number;
};

export const DEFAULT_ENDPOINT_TIMEOUT_MS = 30_000;

export const callEndpoint = async (
  options: CallEndpointOptions,
): Promise<EndpointResult> => {
  const wait = options.endpoint.timeoutMs ?? options.timeoutMs ?? DEFAULT_ENDPOINT_TIMEOUT_MS;
  const expiry = new AbortController();
  const signal = options.signal === undefined ? expiry.signal : AbortSignal.any([options.signal, expiry.signal]);
  const called = { ...options, signal };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<EndpointResult>((settle) => {
    timer = setTimeout(() => {
      settle({ ok: false, error: { status: 0, message: `no reply within ${wait}ms`, data: undefined, timedOut: true } });
      expiry.abort();
    }, wait);
  });
  try {
    const call = 'fn' in options.endpoint ? callFunctionEndpoint(options.endpoint, called) : callHttpEndpoint(options.endpoint, called);
    return await Promise.race([call, expired]);
  } finally {
    clearTimeout(timer);
  }
};

const callHttpEndpoint = async (
  endpoint: HttpEndpointConfig,
  { data, fetch: fetchFn = defaultFetch, transform, signal }: CallEndpointOptions,
): Promise<EndpointResult> => {
  const chain = createScopeChain(data);
  const resolvedUrl = resolve(endpoint.url, chain);
  const url = typeof resolvedUrl === 'string' ? resolvedUrl : String(resolvedUrl ?? '');
  const headers = resolveHeaders(endpoint.headers, chain);

  let body: string | undefined;
  if (endpoint.request !== undefined) {
    if (transform === undefined) {
      return { ok: false, error: { status: 0, message: 'endpoint declares `request` but no transform was injected into the shell', data: undefined } };
    }
    try {
      body = stringifyForBody(transform(endpoint.request, data));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'request transform failed';
      return { ok: false, error: { status: 0, message, data: undefined } };
    }
  }

  let response;
  try {
    response = await fetchFn(url, {
      method: endpoint.method,
      ...(headers === undefined ? {} : { headers }),
      ...(body === undefined ? {} : { body }),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    const message = err instanceof Error ? err.message : 'fetch failed';
    if (isAbort) return { ok: false, error: { status: 0, message, data: undefined, aborted: true } };
    return { ok: false, error: { status: 0, message, data: undefined } };
  }

  if (!response.ok) {
    const failed = await tryParseJson(response);
    const message =
      hasKey(failed, 'message') && typeof failed['message'] === 'string'
        ? failed['message']
        : `HTTP ${response.status}`;
    return { ok: false, error: { status: response.status, message, data: failed } };
  }
  if (response.status === 204 || response.status === 205) {
    return { ok: true, data: undefined, status: response.status };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: { status: response.status, message: `the reply is not JSON (HTTP ${response.status})`, data: undefined } };
  }

  let result: unknown = payload;
  if (endpoint.response !== undefined) {
    if (transform === undefined) {
      return { ok: false, error: { status: response.status, message: 'endpoint declares `response` but no transform was injected into the shell', data: payload } };
    }
    try {
      result = transform(endpoint.response, payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'response transform failed';
      return { ok: false, error: { status: response.status, message, data: payload } };
    }
  }

  const onChange = laterBodiesOf(response, endpoint.response, transform);
  return { ok: true, data: result, status: response.status, ...(onChange === undefined ? {} : { onChange }) };
};

// A later body the transform rejects is dropped: the screen keeps the last good value.
const laterBodiesOf = (
  response: FetchResponse,
  config: unknown,
  transform: TransformFn | undefined,
): ((handler: (data: unknown) => void) => Unsubscribe) | undefined => {
  const subscribe = response.onChange;
  if (subscribe === undefined) return undefined;
  if (config !== undefined && transform === undefined) return undefined;
  return (handler) =>
    subscribe((body) => {
      if (config === undefined || transform === undefined) {
        handler(body);
        return;
      }
      let shaped: unknown;
      try {
        shaped = transform(config, body);
      } catch {
        return;
      }
      handler(shaped);
    });
};

const callFunctionEndpoint = async (
  endpoint: FunctionEndpointConfig,
  { data, signal, functions }: CallEndpointOptions,
): Promise<EndpointResult> => {
  if (signal === undefined) {
    throw new Error('callEndpoint: function variant requires an AbortSignal');
  }
  const handler = functions?.[endpoint.fn];
  if (handler === undefined) {
    throw new Error(`callEndpoint: function "${endpoint.fn}" is not registered`);
  }

  try {
    const result = await handler(data, signal);
    if (signal.aborted) {
      return {
        ok: false,
        error: { status: 0, message: 'aborted', data: undefined, aborted: true },
      };
    }
    return { ok: true, data: result, status: 0 };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    const message = err instanceof Error ? err.message : 'function failed';
    if (isAbort) {
      return { ok: false, error: { status: 0, message, data: undefined, aborted: true } };
    }
    return { ok: false, error: { status: 0, message, data: undefined } };
  }
};
