import type { ActionDefinition } from '@action';
import { isRecord } from './walk';

// ═══════════════════════════════════════════════════════════
// CHAINS THAT NEVER END, found in the definitions. A step list has no
// conditionals, so once a chain can come back to where it started it always
// will: a trigger on `x` that emits `x`, two triggers answering each other, a
// mount that reloads itself, a mount whose emit reaches a trigger that pushes
// the same action again. The runtime stops every such chain at its budget
// (action/runtime/cause.ts); this finds them before anything runs.
//
// The graph: a node is where steps start running — a channel (its message
// triggers) or an action's mount. An edge is a step that starts more:
//
//   · `emit: c`             → the channel c
//   · `reload`              → this action's own mount
//   · `push`/`replace`/`resetTo` of A → A's mount
//
// followed through `call`'s onSuccess/onError, which run as part of the same
// chain. A channel or target written as a template (`{{…}}`) is decided at
// runtime and has no edge; a push to an action not in the set has none
// either. Fragment triggers join when an action is composed — walk the
// composed definitions to see them.
// ═══════════════════════════════════════════════════════════

export type ChainStep = {
  // Where the steps run: `channel:x` or `mount:<action id>`.
  from: string;
  to: string;
  // The action whose trigger or mount carries the step.
  action: string;
  // What the step is: `emit`, `reload`, `push`, `replace`, `resetTo`.
  via: string;
};

export type ChainCycle = {
  // The steps round the cycle, back to where it started.
  steps: ChainStep[];
  // One line: `x —emit (loop)→ x`.
  path: string;
};

const NAV_KEYS = ['push', 'replace', 'resetTo'];

const isLiteral = (value: unknown): value is string => typeof value === 'string' && value !== '' && !value.includes('{{');

const edgesOf = (definition: ActionDefinition, from: string, steps: unknown, known: ReadonlySet<string>, out: ChainStep[]): void => {
  if (!Array.isArray(steps)) return;
  for (const step of steps) {
    if (!isRecord(step)) continue;
    const emit = step['emit'];
    if (isRecord(emit) && isLiteral(emit['channel'])) out.push({ from, to: `channel:${emit['channel']}`, action: definition.id, via: 'emit' });
    if (step['reload'] === true) out.push({ from, to: `mount:${definition.id}`, action: definition.id, via: 'reload' });
    for (const key of NAV_KEYS) {
      const nav = step[key];
      if (isRecord(nav) && isLiteral(nav['action']) && known.has(nav['action'])) out.push({ from, to: `mount:${nav['action']}`, action: definition.id, via: key });
    }
    if (typeof step['call'] === 'string') {
      edgesOf(definition, from, step['onSuccess'], known, out);
      edgesOf(definition, from, step['onError'], known, out);
    }
  }
};

const label = (node: string): string => (node.startsWith('channel:') ? node.slice('channel:'.length) : `mount ${node.slice('mount:'.length)}`);

export const chainCycles = (definitions: Record<string, ActionDefinition> | readonly ActionDefinition[]): ChainCycle[] => {
  const defs = Array.isArray(definitions) ? [...definitions] : Object.values(definitions);
  const known = new Set(defs.map((definition) => definition.id));
  const edges: ChainStep[] = [];
  for (const definition of defs) {
    for (const trigger of definition.triggers ?? []) {
      if (isLiteral(trigger.message)) edgesOf(definition, `channel:${trigger.message}`, trigger.do, known, edges);
    }
    edgesOf(definition, `mount:${definition.id}`, definition.lifecycle?.mount, known, edges);
  }
  const outgoing = new Map<string, ChainStep[]>();
  for (const edge of edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);

  // One cycle per strongly connected component that has one (Tarjan), so a
  // tangle of triggers reports once, not once per rotation of every loop in it.
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;
  const connect = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const edge of outgoing.get(node) ?? []) {
      if (!index.has(edge.to)) {
        connect(edge.to);
        low.set(node, Math.min(low.get(node) ?? 0, low.get(edge.to) ?? 0));
      } else if (onStack.has(edge.to)) {
        low.set(node, Math.min(low.get(node) ?? 0, index.get(edge.to) ?? 0));
      }
    }
    if (low.get(node) !== index.get(node)) return;
    const component: string[] = [];
    for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
      onStack.delete(top);
      component.push(top);
      if (top === node) break;
    }
    components.push(component);
  };
  for (const node of [...outgoing.keys()].sort()) if (!index.has(node)) connect(node);

  // A path round the component from its first node back to it, by
  // breadth-first search inside the component — the shortest such cycle.
  const cycleIn = (component: readonly string[]): ChainStep[] | undefined => {
    const members = new Set(component);
    const start = [...component].sort()[0];
    if (start === undefined) return undefined;
    const via = new Map<string, ChainStep>();
    const queue = [start];
    for (let node = queue.shift(); node !== undefined; node = queue.shift()) {
      for (const edge of outgoing.get(node) ?? []) {
        if (!members.has(edge.to)) continue;
        if (edge.to === start) {
          const steps = [edge];
          for (let back = via.get(node); back !== undefined; back = via.get(back.from)) steps.unshift(back);
          return steps;
        }
        if (via.has(edge.to)) continue;
        via.set(edge.to, edge);
        queue.push(edge.to);
      }
    }
    return undefined;
  };

  return components
    .map(cycleIn)
    .filter((steps): steps is ChainStep[] => steps !== undefined)
    .map((steps) => ({
      steps,
      path: [label(steps[0]?.from ?? ''), ...steps.map((step) => `—${step.via} (${step.action})→ ${label(step.to)}`)].join(' '),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
};
