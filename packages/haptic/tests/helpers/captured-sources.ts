import type { z } from 'zod';
import { HttpSourceSchema } from '../../src/operations/http-source.js';

type Capture = {
  source: z.output<typeof HttpSourceSchema>;
  document: unknown;
  format: string;
  index?: number;
};

/** A test capture has one raw owner; private views carry only its identity. */
export const capturedSources = (values: Capture[]) => {
  const identity = (source: Capture['source']) => ({ url: source.url, sha256: source.body.sha256 });
  const distinct = [
    ...new Map(
      values.map((value) => [value.source.url + '#' + value.source.body.sha256, value.source]),
    ).values(),
  ];
  return {
    owned: values.map((value, index) => ({
      ...value,
      index: value.index ?? index,
      source: identity(value.source),
    })),
    acquisition: {
      sources: distinct.map((source) => ({ source, redirects: [] })),
      redirects: [],
      seen: distinct.map((s) => s.url),
      visited: distinct.map((s) => s.url),
    },
    identities: distinct.map(identity),
  };
};
