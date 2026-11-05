import { MAX_NATIVE_TIMEOUT_MS } from '../engine/control.js';
import { z } from 'zod';
import profile from './default-profile.json' with { type: 'json' };
export const HttpConfigurationSchema = z
  .object({
    maxIdleSockets: z.number().int().positive().default(profile.maxIdleSockets),
    perOriginConcurrency: z.number().int().positive().default(profile.perOriginConcurrency),
    headerTimeoutMs: z
      .number()
      .int()
      .positive()
      .max(MAX_NATIVE_TIMEOUT_MS)
      .default(profile.headerTimeoutMs),
    idleTimeoutMs: z
      .number()
      .int()
      .positive()
      .max(MAX_NATIVE_TIMEOUT_MS)
      .default(profile.idleTimeoutMs),
  })
  .strict();
export type HttpConfiguration = z.infer<typeof HttpConfigurationSchema>;
