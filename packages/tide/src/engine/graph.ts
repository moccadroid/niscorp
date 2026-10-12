import { factOf } from '../schemas';
import type { Reflex } from '../schemas';
import type { EffectRegistry } from '../types';

export type Edge = { from: string; to: string; via: string };

export type GraphReport = {
  edges: readonly Edge[];
  cycles: readonly { reflexIds: readonly string[]; guarded: boolean }[];
  blind: readonly { reflexId: string; effect: string }[];
  errors: readonly string[];
  refusals: readonly { code: 'unknown_reflex' | 'unknown_effect' | 'unguarded_cycle'; message: string }[];
  warnings: readonly string[];
};

const isGuarded = (reflex: Reflex): boolean => reflex.select !== undefined || reflex.when !== undefined;

export const buildGraph = (reflexes: readonly Reflex[], effects: EffectRegistry): GraphReport => {
  const edges: Edge[] = [];
  const refusals: { code: 'unknown_reflex' | 'unknown_effect' | 'unguarded_cycle'; message: string }[] = [];
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
      if (!byId.has(fact.run)) refusals.push({ code: 'unknown_reflex', message: `${reflex.id} watches the run of unknown reflex "${fact.run}"` });
    }
  }

  for (const reflex of reflexes) {
    const handler = effects[reflex.effect.name];
    if (handler === undefined) {
      refusals.push({ code: 'unknown_effect', message: `${reflex.id} names effect "${reflex.effect.name}", which is not registered` });
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
      refusals.push({
        code: 'unguarded_cycle',
        message: `unguarded cycle: ${cycle.reflexIds.join(' → ')} → ${cycle.reflexIds[0]} — no selection and no \`when\` anywhere on the loop, so it diverges by construction`,
      });

  return { edges, cycles, blind, errors: refusals.map((refusal) => refusal.message), refusals, warnings };
};

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
