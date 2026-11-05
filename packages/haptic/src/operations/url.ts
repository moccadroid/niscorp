import { z } from 'zod';
import { defineOperation } from '../engine/operation.js';
import type { Operations } from '../engine/contracts.js';

const httpUrl = z.url({ protocol: /^https?$/ });
const parameter = z.object({ name: z.string(), value: z.string() }).strict();

export const createUrlOperations = (maxJsonDepth: number): Operations => ({
  'url.build': defineOperation({
    maxJsonDepth,
    input: z.object({ url: httpUrl, parameters: z.array(parameter) }).strict(),
    output: httpUrl,
    run(input) {
      const url = new URL(input.url);
      for (const name of new Set(input.parameters.map((entry) => entry.name)))
        url.searchParams.delete(name);
      for (const entry of input.parameters) url.searchParams.append(entry.name, entry.value);
      return url.href;
    },
  }),
  'url.parse': defineOperation({
    maxJsonDepth,
    input: z.object({ url: httpUrl }).strict(),
    output: z
      .object({
        url: httpUrl,
        withoutFragment: httpUrl,
        origin: z.string(),
        pathname: z.string(),
        parameters: z.array(parameter),
      })
      .strict(),
    run(input) {
      const url = new URL(input.url),
        parameters = [...url.searchParams].map(([name, value]) => ({ name, value }));
      const original = url.href;
      url.hash = '';
      return {
        url: original,
        withoutFragment: url.href,
        origin: url.origin,
        pathname: url.pathname,
        parameters,
      };
    },
  }),
});
