import { MIMEType } from 'node:util';
import { OperationFailure } from '../../engine/control.js';

/** XML MIME precedence: BOM, transport charset, XML declaration, UTF-8. */
export const decodeXml = (
  bytes: Buffer,
  headers: Record<string, string[]>,
): { xml: string; encoding: string } => {
  const starts = (...prefix: number[]): boolean => prefix.every((b, i) => bytes[i] === b);
  if (starts(0, 0, 0xfe, 0xff) || starts(0xff, 0xfe, 0, 0))
    throw new OperationFailure('XML_ENCODING', 'UTF-32 XML is not supported');
  const bom = starts(0xef, 0xbb, 0xbf)
    ? 'utf-8'
    : starts(0xfe, 0xff)
      ? 'utf-16be'
      : starts(0xff, 0xfe)
        ? 'utf-16le'
        : null;
  const signature = starts(0, 0x3c, 0, 0x3f)
    ? 'utf-16be'
    : starts(0x3c, 0, 0x3f, 0)
      ? 'utf-16le'
      : null;
  const types = Object.entries(headers)
    .filter(([name]) => name.toLowerCase() === 'content-type')
    .flatMap(([, values]) => values);
  if (types.length > 1)
    throw new OperationFailure('XML_CONTENT_TYPE', 'Multiple Content-Type values');
  try {
    const transport = types[0] === undefined ? null : new MIMEType(types[0]).params.get('charset');
    const prefix = signature
      ? new TextDecoder(signature, { fatal: true }).decode(bytes)
      : bytes.toString('latin1');
    const declaration = /^<\?xml\s[^?]*?\bencoding\s*=\s*(['"])([A-Za-z][A-Za-z0-9._-]*)\1/.exec(
      prefix,
    )?.[2];
    const decoder = new TextDecoder(bom ?? transport ?? declaration ?? signature ?? 'utf-8', {
      fatal: true,
    });
    return { xml: decoder.decode(bytes), encoding: decoder.encoding };
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError)
      throw new OperationFailure('XML_ENCODING', error.message);
    throw error;
  }
};
