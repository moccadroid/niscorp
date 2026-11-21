import { MIMEType } from 'node:util';
import { getEncoding } from 'encoding-sniffer';
import { readHtmlProfile } from './profile.schema.js';
import { readCapturedHeaders } from '../headers.js';
export const headerValues = (headers: Record<string, string[]>, name: string): string[] =>
  Object.entries(headers)
    .filter(([key]) => key.toLowerCase() === name)
    .flatMap(([, values]) => values);
export const decodeHtmlSource = (
  bytes: Uint8Array,
  headersInput: Record<string, string[]>,
  profileInput?: unknown,
): {
  encoding: string;
  html: string;
} => {
  const profile = readHtmlProfile(profileInput),
    headers = readCapturedHeaders(headersInput);
  if (bytes.byteLength > profile.limits.maxInputBytes) throw new Error('HTML_SOURCE_BYTE_BUDGET');
  const contentTypes = headerValues(headers, 'content-type');
  if (contentTypes.length > 1) throw new Error('HTML_CONTENT_TYPE_AMBIGUOUS');
  const contentType = contentTypes[0];
  const transport =
    contentType === undefined
      ? undefined
      : (new MIMEType(contentType).params.get('charset') ?? undefined);
  const encoding = getEncoding(bytes, {
    maxBytes: profile.charset.prescanBytes,
    defaultEncoding: profile.charset.fallbackEncoding,
    transportLayerEncodingLabel: transport,
  });
  const decoder = new TextDecoder(encoding, { fatal: true });
  return { encoding: decoder.encoding, html: decoder.decode(bytes) };
};
