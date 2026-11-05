import { z } from 'zod';
import type { JsonValue, Operations } from '../engine/contracts.js';
import { defineOperation } from '../engine/operation.js';
import { HttpSourceSchema, readSourceBody } from '../operations/http-source.js';
import { createHtmlStructure, decodeHtmlSource, readHtmlProfile } from '../readers/html/index.js';

export const HtmlDocumentSchema = z
  .object({
    url: z.url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    encoding: z.string().min(1),
    html: z.string(),
  })
  .strict();

const decodeSource = (
  source: z.infer<typeof HttpSourceSchema>,
  profile?: unknown,
): { url: string; sha256: string; encoding: string; html: string } => ({
  url: source.url,
  sha256: source.body.sha256,
  ...decodeHtmlSource(readSourceBody(source), source.headers, profile),
});
export const openHtml = (
  source: z.infer<typeof HttpSourceSchema>,
  signal: AbortSignal,
  profileInput?: unknown,
): {
  url: string;
  sha256: string;
  encoding: string;
  html: string;
  structure: ReturnType<typeof createHtmlStructure>;
} => {
  const profile = readHtmlProfile(profileInput);
  const decoded = decodeSource(source, profile);
  const { maxInputBytes: _maxInputBytes, ...structureLimits } = profile.limits;
  const structure = createHtmlStructure(decoded.html, structureLimits, signal);
  return { ...decoded, structure };
};

export const createHtmlInspectionOperations = (
  profileInput?: unknown,
  maxJsonDepth?: number,
): Operations => {
  const profile = readHtmlProfile(profileInput);
  return {
    'html.inspect': defineOperation({
      maxJsonDepth,
      input: z.object({ source: HttpSourceSchema }).strict(),
      output: HtmlDocumentSchema,
      run({ source }): JsonValue {
        return decodeSource(source, profile);
      },
    }),
  };
};
