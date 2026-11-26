import { isIP } from 'node:net';
import type { ShellOpening } from '../shells';

export type Visitor = NonNullable<ShellOpening['visitor']>;

export type VisitorRequest = {
  peer?: string | null | undefined;
  headers?: Readonly<Record<string, string | readonly string[] | undefined>> | undefined;
};

export type ReadVisitor = (request: VisitorRequest | undefined) => Visitor | null;

const MAPPED_V4 = '::ffff:';

const ipOf = (value: string | null | undefined): string | null => {
  const written = value?.trim() ?? '';
  const v4 = written.toLowerCase().startsWith(MAPPED_V4) ? written.slice(MAPPED_V4.length) : '';
  if (isIP(v4) === 4) return v4;
  return isIP(written) === 0 ? null : written;
};

export const visitorReader = (settings: { ipHeader?: string | undefined; headers?: readonly string[] | undefined }): ReadVisitor => {
  const ipHeader = settings.ipHeader?.toLowerCase();
  const kept = [...new Set((settings.headers ?? []).map((name) => name.toLowerCase()))];
  return (request) => {
    const sent = request?.headers;
    if (sent === undefined) return null;
    const fromHeader = ipHeader === undefined ? undefined : sent[ipHeader];
    const ip = ipHeader === undefined ? ipOf(request?.peer) : typeof fromHeader === 'string' ? ipOf(fromHeader) : null;
    const headers: Record<string, string> = {};
    for (const name of kept) {
      const value = sent[name];
      if (value !== undefined) headers[name] = typeof value === 'string' ? value : value.join(', ');
    }
    return Object.freeze({ ip, headers: Object.freeze(headers) });
  };
};

// One machine is usually handed a whole IPv6 /64, so an IPv6 address counts as its /64.
export const limitKeyOf = (ip: string): string => {
  if (isIP(ip) !== 6) return ip;
  const bare = ip.split('%')[0] ?? ip;
  const halves = bare.split('::');
  const groups = (part: string | undefined): string[] => (part === undefined || part === '' ? [] : part.split(':'));
  const head = groups(halves[0]);
  const tail = groups(halves[1]);
  const width = (list: readonly string[]): number => list.reduce((sum, group) => sum + (group.includes('.') ? 2 : 1), 0);
  const all = halves.length > 1 ? [...head, ...Array<string>(8 - width(head) - width(tail)).fill('0'), ...tail] : head;
  return `${all
    .slice(0, 4)
    .map((group) => Number.parseInt(group, 16).toString(16))
    .join(':')}::/64`;
};
