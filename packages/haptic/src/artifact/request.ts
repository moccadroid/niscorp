import type { Request } from './schema.js';

export type Values = Record<string, string | number>;

// One request as it is sent: its body already encoded, its headers the artifact's (the transport adds its own).
export type PageRequest = {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body: string | null;
};

const NAME = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const WHOLE = /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

export const getRequest = (url: string): PageRequest => ({ method: 'GET', url, headers: {}, body: null });

// What tells two requests apart: a GET is its address, so a run reads one address once as before.
export const requestKey = (request: PageRequest): string =>
  request.method === 'GET' ? request.url : `${request.method} ${request.url}\n${request.body ?? ''}`;

const leaves = (value: unknown, found: string[]): void => {
  if (typeof value === 'string') {
    const name = WHOLE.exec(value)?.[1];
    if (name) found.push(name);
  } else if (Array.isArray(value)) value.forEach((item) => leaves(item, found));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => leaves(item, found));
};

// Every name the request fills, with where it is.
export const templateNames = (request: Request): { name: string; at: string }[] => {
  const found: { name: string; at: string }[] = [];
  const text = (at: string, value: string) => {
    for (const match of value.matchAll(NAME)) found.push({ name: match[1] as string, at });
  };
  text('request.url', request.url);
  for (const [header, value] of Object.entries(request.headers ?? {}))
    text(`request.headers.${header}`, value);
  const body = request.body;
  if (body) {
    const names: string[] = [];
    leaves('form' in body ? body.form : body.json, names);
    for (const name of names) found.push({ name, at: 'request.body' });
  }
  return found;
};

const filledText = (value: string, values: Values, encode: (text: string) => string) =>
  value.replace(NAME, (whole, name: string) => (name in values ? encode(String(values[name])) : whole));

const filledLeaves = (value: unknown, values: Values): unknown => {
  if (typeof value === 'string') {
    const name = WHOLE.exec(value)?.[1];
    return name && name in values ? values[name] : value;
  }
  if (Array.isArray(value)) return value.map((item) => filledLeaves(item, values));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, filledLeaves(item, values)]));
  return value;
};

const hasHeader = (headers: Record<string, string>, name: string) =>
  Object.keys(headers).some((key) => key.toLowerCase() === name);

// The request with these values: in the address and the headers each "{name}" in the text, in one pass so a value is
// never filled again; in a body only a string that is exactly "{name}", by the value with its type.
export const fillRequest = (request: Request, values: Values): PageRequest => {
  const headers = Object.fromEntries(
    Object.entries(request.headers ?? {}).map(([name, value]) => [name, filledText(value, values, (v) => v)]),
  );
  let body: string | null = null;
  if (request.body && 'form' in request.body) {
    const form = filledLeaves(request.body.form, values) as Record<string, string | number>;
    body = new URLSearchParams(Object.entries(form).map(([k, v]) => [k, String(v)])).toString();
    if (!hasHeader(headers, 'content-type')) headers['content-type'] = 'application/x-www-form-urlencoded';
  } else if (request.body) {
    body = JSON.stringify(filledLeaves(request.body.json, values));
    if (!hasHeader(headers, 'content-type')) headers['content-type'] = 'application/json';
  }
  return {
    method: request.method,
    url: filledText(request.url, values, encodeURIComponent),
    headers,
    body,
  };
};
