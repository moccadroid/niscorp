import { isIP } from 'node:net';

// CSP3 URL-source matching, scoped to base-uri. This never loads page resources.
const schemeMatches = (source: string, target: string): boolean =>
  source === target ||
  (source === 'http:' && target === 'https:') ||
  (source === 'ws:' && ['wss:', 'http:', 'https:'].includes(target)) ||
  (source === 'wss:' && target === 'https:');
const defaultPorts: Readonly<Record<string, number>> = {
  'http:': 80,
  'https:': 443,
  'ws:': 80,
  'wss:': 443,
  'ftp:': 21,
};
const portOf = (url: URL): number | undefined =>
  url.port ? Number(url.port) : defaultPorts[url.protocol];
const decoded = (part: string): string =>
  part.replace(/%([a-f\d]{2})/gi, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
const pathMatches = (source: string, target: string): boolean => {
  const a = source.split('/'),
    b = target.split('/');
  if (source.endsWith('/')) a.pop();
  else if (a.length !== b.length) return false;
  return (
    a.length <= b.length && a.every((part, index) => decoded(part) === decoded(b[index] ?? ''))
  );
};
const sourceMatches = (source: string, target: URL, origin: URL): boolean => {
  if (source === '*')
    return ['http:', 'https:'].includes(target.protocol) || target.protocol === origin.protocol;
  if (source.toLowerCase() === "'self'")
    return (
      target.protocol !== 'blob:' &&
      origin.origin !== 'null' &&
      (origin.origin === target.origin ||
        (origin.hostname === target.hostname &&
          (portOf(origin) === portOf(target) || (!origin.port && !target.port)) &&
          (['https:', 'wss:'].includes(target.protocol) ||
            (origin.protocol === 'http:' && ['http:', 'ws:'].includes(target.protocol)))))
    );
  if (/^[a-z][a-z\d+.-]*:$/i.test(source))
    return schemeMatches(source.toLowerCase(), target.protocol);
  const match =
    /^(?:([a-z][a-z\d+.-]*):\/\/)?(\*|(?:\*\.)?[a-z\d-]+(?:\.[a-z\d-]+)*\.?)(?::(\*|\d+))?(\/(?:[a-z\d\-._~!$&'()*+,;=:@/]|%[a-f\d]{2})*)?$/i.exec(
      source,
    );
  if (!match) return false;
  const [, scheme, host, port, path] = match;
  if (
    !host ||
    !target.hostname ||
    isIP(target.hostname.replace(/^\[|\]$/g, '')) ||
    !schemeMatches(scheme ? scheme.toLowerCase() + ':' : origin.protocol, target.protocol)
  )
    return false;
  const pattern = host.toLowerCase(),
    hostname = target.hostname.toLowerCase();
  if (
    pattern !== '*' &&
    !(pattern.startsWith('*.') ? hostname.endsWith(pattern.slice(1)) : hostname === pattern)
  )
    return false;
  if (port !== '*' && (port === undefined ? Boolean(target.port) : Number(port) !== portOf(target)))
    return false;
  return path === undefined || pathMatches(path, target.pathname);
};

export const allowsHtmlBase = (target: URL, origin: URL, policies: readonly string[]): boolean =>
  policies.every((policy) => {
    // The first occurrence of a directive wins. default-src does not govern base-uri.
    for (const directive of policy.split(';')) {
      const [name, ...sources] = directive
        .replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '')
        .split(/[\t\n\f\r ]+/);
      if (name?.toLowerCase() === 'base-uri')
        return sources.some((source) => sourceMatches(source, target, origin));
    }
    return true;
  });
