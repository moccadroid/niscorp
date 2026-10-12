import { ConfigSchema } from '../schemas/config.schema';
import { explainIssues } from '../utils/issues';
import { depthRefusal, exceedsDepth } from '@niscorp/strata';
import type { ValidationResult } from '../types';

export const validate = (config: unknown): ValidationResult => {
  if (exceedsDepth(config)) return { ok: false, issues: [{ path: [], message: depthRefusal() }] };
  const parsed = ConfigSchema.safeParse(config);
  if (!parsed.success) {
    return {
      ok: false,
      issues: explainIssues(parsed.error.issues),
    };
  }
  return { ok: true, data: parsed.data };
};
