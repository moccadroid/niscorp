import { ReflexSchema } from '../schemas';
import type { Reflex, ReflexInput } from '../schemas';
import { TideError } from '../errors';
import type { EffectRegistry } from '../types';
import { buildGraph } from './graph';
import type { GraphReport } from './graph';

export type Admitted = { reflexes: readonly Reflex[]; graph: GraphReport };

export const admitReflexes = (input: readonly ReflexInput[], effectsOf: (reflexes: readonly Reflex[]) => EffectRegistry): Admitted => {
  const parsed: Reflex[] = [];
  const seen = new Set<string>();

  for (const candidate of input) {
    const result = ReflexSchema.safeParse(candidate);
    if (!result.success)
      throw new TideError('invalid_reflex', `reflex did not parse: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, {
        issues: result.error.issues,
      });
    if (seen.has(result.data.id)) throw new TideError('duplicate_reflex', `duplicate reflex id "${result.data.id}"`);
    seen.add(result.data.id);
    parsed.push(result.data);
  }

  const graph = buildGraph(parsed, effectsOf(parsed));
  const refused = graph.refusals[0];
  if (refused !== undefined)
    throw new TideError(refused.code, `tide refused to load:\n  ${graph.errors.join('\n  ')}`, { errors: graph.errors, refusals: graph.refusals });

  return { reflexes: parsed, graph };
};
