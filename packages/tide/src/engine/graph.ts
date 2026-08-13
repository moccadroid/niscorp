import { factOf } from '../schemas';
import type { Reflex } from '../schemas';
import type { EffectRegistry } from '../types';

// ═══════════════════════════════════════════════════════════════
// The flow graph — derived, never drawn
//
// Reflexes WATCH entities (their triggers name them); effects
// WRITE entities. An edge is a write meeting a watch. The graph is
// therefore STATIC DATA computed from the artifacts — under moss,
// `writes` is DERIVED from the vex mutation behind each effect —
// which is what makes it impossible for the flowchart to drift
// from the flow.
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
  // Effects with no declared (or derived) `writes` — the checker cannot
  // see through them. Under moss, where `writes` derives from the vex
  // mutation, a blind edge means something BYPASSED vex, which is exactly
  // when a loud word is wanted.
  blind: readonly { reflexId: string; effect: string }[];
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
  const blind: { reflexId: string; effect: string }[] = [];

  const byId = new Map(reflexes.map((reflex) => [reflex.id, reflex]));

  const watchers = new Map<string, string[]>();
  const runWatchers = new Map<string, string[]>();
  for (const reflex of reflexes) {
    const fact = factOf(reflex.on);
    if (fact?.entity !== undefined) {
      const existing = watchers.get(fact.entity) ?? [];
      watchers.set(fact.entity, [...existing, reflex.id]);
    }
    if (fact?.run !== undefined) {
      const existing = runWatchers.get(fact.run) ?? [];
      runWatchers.set(fact.run, [...existing, reflex.id]);
      if (fact.run === reflex.id) warnings.push(`${reflex.id} subscribes to its own run — a drain loop; make sure it narrows`);
      if (!byId.has(fact.run)) errors.push(`${reflex.id} watches the run of unknown reflex "${fact.run}"`);
    }
  }

  for (const reflex of reflexes) {
    const handler = effects[reflex.effect.name];
    if (handler === undefined) {
      errors.push(`${reflex.id} names effect "${reflex.effect.name}", which is not registered`);
      continue;
    }
    if (handler.writes === undefined) {
      blind.push({ reflexId: reflex.id, effect: reflex.effect.name });
      continue;
    }
    for (const entity of handler.writes)
      for (const target of watchers.get(entity) ?? []) edges.push({ from: reflex.id, to: target, via: entity });
  }

  for (const [source, targets] of runWatchers)
    for (const target of targets) if (byId.has(source)) edges.push({ from: source, to: target, via: `run:${source}` });

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

  return { edges, cycles, blind, errors, warnings };
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
