import { createHash } from 'node:crypto';
import { z } from 'zod';
import { RunControl } from '../engine/control.js';

export const BodySchema = z
  .object({
    base64: z
      .string()
      .describe('Exact entity bytes encoded as base64; not extracted document text.'),
    bytes: z.number().int().nonnegative().describe('Entity byte length before base64 encoding.'),
    sha256: z.string().describe('SHA-256 of those exact entity bytes.'),
  })
  .strict();

export const HttpSourceSchema = z
  .object({
    url: z.url().describe('URL requested for this physical HTTP response.'),
    status: z.number().int().describe('HTTP response status code.'),
    headers: z
      .record(z.string(), z.array(z.string()))
      .describe('Lowercase HTTP header names with all received values.'),
    encoded: BodySchema.describe(
      'Original entity before HTTP content decoding, with its own bytes and hash.',
    ),
    body: BodySchema.describe(
      'Content-decoded entity consumed by readers; character decoding has not yet occurred.',
    ),
  })
  .strict();
export type HttpSource = z.infer<typeof HttpSourceSchema>;

export const captureBody = (bytes: Uint8Array): z.infer<typeof BodySchema> => ({
  base64: Buffer.from(bytes).toString('base64'),
  bytes: bytes.byteLength,
  sha256: createHash('sha256').update(bytes).digest('hex'),
});

export const readSourceBody = (source: HttpSource): Buffer => {
  const bytes = Buffer.from(source.body.base64, 'base64');
  if (
    bytes.byteLength !== source.body.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== source.body.sha256
  ) {
    throw new RunControl('BODY_MISMATCH', 'Source body does not match its bytes and hash');
  }
  return bytes;
};
