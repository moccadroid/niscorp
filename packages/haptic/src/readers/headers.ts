import { z } from 'zod';
import { snapshotJson } from '../engine/json.js';
import profile from '../engine/default-profile.json' with { type: 'json' };
const schema = z.record(z.string(), z.array(z.string()));
export const readCapturedHeaders = (value: unknown): Record<string, string[]> =>
  schema.parse(snapshotJson(value, profile.maxJsonDepth));
