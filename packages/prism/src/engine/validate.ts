import { ConfigSchema } from '../schemas/config.schema';
import { explainIssues } from '../utils/issues';
import type { ValidationResult } from '../types';

export const validate = (config: unknown): ValidationResult => {
  const parsed = ConfigSchema.safeParse(config);
  if (!parsed.success) {
    return {
      ok: false,
      // The branch the config meant, with its full path — not the root union's
      // "Invalid input" (see utils/issues).
      issues: explainIssues(parsed.error.issues),
    };
  }
  return { ok: true, data: parsed.data };
};
