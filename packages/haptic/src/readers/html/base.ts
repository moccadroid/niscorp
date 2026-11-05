import type { HtmlStructure } from './structure.js';
import { headerValues } from './decode.js';
import { readCapturedHeaders } from '../headers.js';
import { readHtmlProfile } from './profile.schema.js';
import { allowsHtmlBase } from './base-policy.js';
export const resolveHtmlUrl = (raw: string, base: string, encoding: string): URL => {
  const head = raw.split('#')[0] ?? '',
    query = head.indexOf('?');
  if (
    new TextDecoder(encoding).encoding !== 'utf-8' &&
    query >= 0 &&
    /[^\x00-\x7f]/.test(head.slice(query + 1))
  ) {
    throw new Error('HTML_LEGACY_QUERY_ENCODING_UNSUPPORTED');
  }
  return new URL(raw, base);
};
export const effectiveHtmlBase = (
  structure: HtmlStructure,
  responseUrl: string,
  headersInput: Record<string, string[]>,
  encoding: string,
  profileInput?: unknown,
): {
  baseUrl: string;
  source: {
    path: number[];
    href: string;
  } | null;
} => {
  readHtmlProfile(profileInput);
  new TextDecoder(encoding);
  const headers = readCapturedHeaders(headersInput),
    facts = structure.baseFacts();
  const fallback = new URL(responseUrl).href;
  if (!facts.firstBase) return { baseUrl: fallback, source: null };
  let target: URL;
  try {
    target = resolveHtmlUrl(facts.firstBase.href, fallback, encoding);
  } catch (error) {
    if (error instanceof Error && error.message === 'HTML_LEGACY_QUERY_ENCODING_UNSUPPORTED')
      throw error;
    return { baseUrl: fallback, source: facts.firstBase };
  }
  const policies = [
    ...headerValues(headers, 'content-security-policy').flatMap((value) => value.split(',')),
    ...facts.policies,
  ];
  return {
    baseUrl:
      ['data:', 'javascript:'].includes(target.protocol) ||
      !allowsHtmlBase(target, new URL(fallback), policies)
        ? fallback
        : target.href,
    source: facts.firstBase,
  };
};
