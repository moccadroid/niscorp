import { ReflexSchema } from '../schemas';
import type { Reflex, ReflexInput } from '../schemas';
import { TideError } from '../errors';
import type { EffectRegistry, LoadRefusal } from '../types';
import { buildGraph } from './graph';
import type { GraphReport } from './graph';

export type Admitted = { reflexes: readonly Reflex[]; graph: GraphReport; refused: readonly LoadRefusal[] };

const idOf = (candidate: unknown): string | undefined =>
  typeof candidate === 'object' && candidate !== null && 'id' in candidate && typeof candidate.id === 'string' ? candidate.id : undefined;

// What a load may hold. By default the first reflex that does not parse, a duplicate id, or a graph that does not hold
// refuses the whole load, as it always has. `isolate` refuses each such reflex alone, with its reason, and admits the
// rest: for a host whose reflexes are its people's rows, where one person's bad row must not stop everybody else's.
export const admitReflexes = (input: readonly ReflexInput[], effectsOf: (reflexes: readonly Reflex[]) => EffectRegistry, isolate: boolean): Admitted => {
  const parsed: Reflex[] = [];
  const refused: LoadRefusal[] = [];
  const seen = new Set<string>();

  for (const candidate of input) {
    const result = ReflexSchema.safeParse(candidate);
    if (!result.success) {
      const message = `reflex did not parse: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
      if (!isolate) throw new TideError('invalid_reflex', message, { issues: result.error.issues });
      refused.push({ reflexId: idOf(candidate), code: 'invalid_reflex', message });
      continue;
    }
    if (seen.has(result.data.id)) {
      const message = `duplicate reflex id "${result.data.id}"`;
      if (!isolate) throw new TideError('duplicate_reflex', message);
      refused.push({ reflexId: result.data.id, code: 'duplicate_reflex', message });
      continue;
    }
    seen.add(result.data.id);
    parsed.push(result.data);
  }

  // Leaving one out can strand another (a reflex that watches its run), so the graph is checked again until it holds.
  // Every round removes at least one reflex: each refusal names the reflexes it is about.
  let kept: readonly Reflex[] = parsed;
  let graph = buildGraph(kept, effectsOf(kept));
  for (let [first] = graph.refusals; first !== undefined; [first] = graph.refusals) {
    if (!isolate) throw new TideError(first.code, `tide refused to load:\n  ${graph.errors.join('\n  ')}`, { errors: graph.errors, refusals: graph.refusals });
    const out = new Set(graph.refusals.flatMap((refusal) => refusal.reflexIds));
    for (const refusal of graph.refusals) for (const reflexId of refusal.reflexIds) refused.push({ reflexId, code: refusal.code, message: refusal.message });
    kept = kept.filter((reflex) => !out.has(reflex.id));
    graph = buildGraph(kept, effectsOf(kept));
  }

  return { reflexes: kept, graph, refused };
};
