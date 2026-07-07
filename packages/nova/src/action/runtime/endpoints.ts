import { createScopeChain, resolve } from '@shared/bindings';
import { hasKey } from '@shared/common';
import type { ScopeChain } from '@shared/bindings';
import type { EndpointConfig, FunctionEndpointConfig, HttpEndpointConfig } from '../schemas';
import type { FetchFn, FunctionHandler, TransformFn } from '../types';

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
  | { ok: true; data: unknown; status: number }
  | { ok: false; error: { status: number; message: string; data: unknown; aborted?: boolean } };

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
};

export const callEndpoint = async (
  options: CallEndpointOptions,
): Promise<EndpointResult> => {
  if ('fn' in options.endpoint) return callFunctionEndpoint(options.endpoint, options);
  return callHttpEndpoint(options.endpoint, options);
};

const callHttpEndpoint = async (
  endpoint: HttpEndpointConfig,
  { data, fetch: fetchFn = defaultFetch, transform, signal }: CallEndpointOptions,
): Promise<EndpointResult> => {
  const chain = createScopeChain(data);
  const resolvedUrl = resolve(endpoint.url, chain);
  const url = typeof resolvedUrl === 'string' ? resolvedUrl : String(resolvedUrl ?? '');
  const headers = resolveHeaders(endpoint.headers, chain);

  // `request` builds the body from the action data via the injected evaluator.
  // Declared without one is a hard error (never a silent empty body).
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

  const payload = await tryParseJson(response);

  if (!response.ok) {
    const message =
      hasKey(payload, 'message') && typeof payload['message'] === 'string'
        ? payload['message']
        : `HTTP ${response.status}`;
    return { ok: false, error: { status: response.status, message, data: payload } };
  }

  // `response` shapes the reply via the injected evaluator — over the reply
  // exactly as received (`$` is the reply: object, array, or scalar; no wrapping).
  // Declared without an evaluator is a hard error (never silently serve the
  // unshaped reply).
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

  return { ok: true, data: result, status: response.status };
};

const callFunctionEndpoint = async (
  endpoint: FunctionEndpointConfig,
  { data, signal, functions }: CallEndpointOptions,
): Promise<EndpointResult> => {
  // Callers dispatching to a function endpoint must provide both a signal and
  // a registered handler. `runCall` guarantees both before reaching here.
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
