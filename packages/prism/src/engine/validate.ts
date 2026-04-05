import { ConfigSchema } from '../schemas/config.schema';
import type { ValidationResult } from '../types';

export const validate = (config: unknown): ValidationResult => {
  const parsed = ConfigSchema.safeParse(config);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
        message: i.message,
      })),
    };
  }
  return { ok: true, data: parsed.data };
};
