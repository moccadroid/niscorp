import { factOf } from '../schemas';
import type { Reflex } from '../schemas';
import type { EffectRegistry } from '../types';

// ═══════════════════════════════════════════════════════════════
// The flow graph — derived, never drawn
//
// Reflexes declare what they watch; effects declare what they
// touch. The graph is therefore STATIC DATA computed from the
// artifacts, which is what makes it impossible for the flowchart
// to drift from the flow.
//
// Cycles are CLASSIFIED, not banned. Tide's own best patterns are
// cycles on purpose — a drip campaign is a reflex whose delayed
// fact fires itself; a drain loop subscribes to its own firing —
// and they converge because every loop passes a GUARD. Static
// analysis cannot tell a convergent cycle from a divergent one,
// so it does not pretend to: only a wholly unguarded loop, which
// diverges by construction, is refused.
// ═══════════════════════════════════════════════════════════════

export type Edge = { from: string; to: string; via: string };

export type GraphReport = {
  edges: readonly Edge[];
  cycles: readonly { reflexIds: readonly string[]; guarded: boolean }[];
  unverifiable: readonly { reflexId: string; effect: string }[];
  errors: readonly string[];
  warnings: readonly string[];
};

// A guard is what makes a loop convergent: a selection that re-checks
// reality, or a predicate that can say no. `notBefore` also guards, but it
// is a runtime property of an emitted fact and cannot be seen from here —
// which is why an unguarded cycle is reported as an error the author can
// argue with, not a silent refusal.
const isGuarded = (reflex: Reflex): boolean => reflex.select !== undefined || reflex.when !== undefined;

export const buildGraph = (reflexes: readonly Reflex[], effects: EffectRegistry): GraphReport => {
  const edges: Edge[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const unverifiable: { reflexId: string; effect: string }[] = [];

  const byId = new Map(reflexes.map((reflex) => [reflex.id, reflex]));

  const watchers = new Map<string, string[]>();
  const firingWatchers = new Map<string, string[]>();
  for (const reflex of reflexes) {
    const fact = factOf(reflex.on);
    if (fact?.entity !== undefined) {
      const existing = watchers.get(fact.entity) ?? [];
      watchers.set(fact.entity, [...existing, reflex.id]);
    }
    if (fact?.firing !== undefined) {
      const existing = firingWatchers.get(fact.firing) ?? [];
      firingWatchers.set(fact.firing, [...existing, reflex.id]);
      if (fact.firing === reflex.id) warnings.push(`${reflex.id} subscribes to its own firing — a drain loop; make sure it narrows`);
      if (!byId.has(fact.firing)) errors.push(`${reflex.id} watches the firing of unknown reflex "${fact.firing}"`);
    }
  }

  for (const reflex of reflexes) {
    const handler = effects[reflex.effect.name];
    if (handler === undefined) {
      errors.push(`${reflex.id} names effect "${reflex.effect.name}", which is not registered`);
      continue;
    }
    if (handler.touches === undefined) {
      unverifiable.push({ reflexId: reflex.id, effect: reflex.effect.name });
      continue;
    }
    for (const entity of handler.touches)
      for (const target of watchers.get(entity) ?? []) edges.push({ from: reflex.id, to: target, via: entity });
  }

  for (const [source, targets] of firingWatchers)
    for (const target of targets) if (byId.has(source)) edges.push({ from: source, to: target, via: `firing:${source}` });

  const cycles = findCycles(reflexes, edges).map((reflexIds) => ({
    reflexIds,
    guarded: reflexIds.some((id) => {
      const reflex = byId.get(id);
      return reflex !== undefined && isGuarded(reflex);
    }),
  }));

  for (const cycle of cycles)
    if (!cycle.guarded)
      errors.push(
        `unguarded cycle: ${cycle.reflexIds.join(' → ')} → ${cycle.reflexIds[0]} — no selection and no \`when\` anywhere on the loop, so it diverges by construction`,
      );

  return { edges, cycles, unverifiable, errors, warnings };
};

// Tarjan's SCC. Components of size > 1 are cycles; a size-1 component is
// one only when it edges to itself.
const findCycles = (reflexes: readonly Reflex[], edges: readonly Edge[]): string[][] => {
  const adjacency = new Map<string, string[]>();
  for (const reflex of reflexes) adjacency.set(reflex.id, []);
  for (const edge of edges) {
    const existing = adjacency.get(edge.from);
    if (existing !== undefined) existing.push(edge.to);
  }

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  const strongConnect = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of adjacency.get(node) ?? []) {
      const nextIndex = index.get(next);
      if (nextIndex === undefined) {
        strongConnect(next);
        const nextLow = low.get(next);
        const nodeLow = low.get(node);
        if (nextLow !== undefined && nodeLow !== undefined) low.set(node, Math.min(nodeLow, nextLow));
      } else if (onStack.has(next)) {
        const nodeLow = low.get(node);
        if (nodeLow !== undefined) low.set(node, Math.min(nodeLow, nextIndex));
      }
    }

    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let popped = stack.pop();
      while (popped !== undefined) {
        onStack.delete(popped);
        component.push(popped);
        if (popped === node) break;
        popped = stack.pop();
      }
      components.push(component.reverse());
    }
  };

  for (const reflex of reflexes) if (!index.has(reflex.id)) strongConnect(reflex.id);

  const selfLooping = new Set(edges.filter((edge) => edge.from === edge.to).map((edge) => edge.from));
  return components.filter((component) => {
    if (component.length > 1) return true;
    const only = component[0];
    return only !== undefined && selfLooping.has(only);
  });
};
