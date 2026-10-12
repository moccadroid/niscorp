// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createComponentRegistry } from '../../src/layout';
import { createDomView } from '../../src/adapters/dom';
import type { DomComponent } from '../../src/adapters/dom';
import type { NovaEvent } from '../../src/shared/event-bus/schemas';
import type { RenderComponentNode, RenderNode } from '../../src/layout/types';

type Rng = () => number;
const seeded = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const pick = <T>(r: Rng, first: T, ...rest: T[]): T => [first, ...rest][Math.floor(r() * (rest.length + 1))] ?? first;
const shuffled = <T>(r: Rng, items: readonly T[]): T[] =>
  items
    .map((item) => ({ item, at: r() }))
    .sort((a, b) => a.at - b.at)
    .map(({ item }) => item);

const component = (name: string, props: Record<string, unknown>, children: RenderNode[], ref?: string): RenderComponentNode => ({
  type: 'component',
  name,
  props,
  children,
  ...(ref === undefined ? {} : { ref }),
});

const WORDS = ['alpha', 'beta', 'gamma', 'delta'] as const;
const KEYS = ['k1', 'k2', 'k3', 'k4', 'k5'] as const;
const MAX_DEPTH = 4;

const text = (r: Rng): RenderNode => ({ type: 'text', value: pick(r, ...WORDS) });
const props = (r: Rng, name: string): Record<string, unknown> => {
  if (name === 'Press') return { value: pick(r, 1, 2, 3) };
  if (name === 'Leaf') return { label: pick(r, ...WORDS) };
  return r() < 0.3 ? { tone: pick(r, 'paper', 'ink') } : {};
};
const children = (r: Rng, depth: number, slots: boolean): RenderNode[] => Array.from({ length: Math.floor(r() * 4) }, () => node(r, depth, slots));

// `slots`: only the outer canvas may place a canvas. One that could place
// itself would never stop.
const node = (r: Rng, depth: number, slots: boolean): RenderNode => {
  const roll = r();
  if (depth >= MAX_DEPTH || roll < 0.22) return text(r);
  if (roll < 0.26) return { type: 'error', code: 'BROKEN', message: pick(r, ...WORDS) };
  if (roll < 0.42) {
    const keys = shuffled(r, KEYS).slice(0, Math.floor(r() * (KEYS.length + 1)));
    return { type: 'fragment', children: keys.map((key) => ({ ...component('Box', props(r, 'Box'), children(r, depth + 1, slots)), key })) };
  }
  if (slots && roll < 0.5) return component('CanvasSlot', { canvasId: pick(r, 'inner', 'other') }, []);
  if (roll < 0.58) {
    const instanceId = pick(r, 'i-1', 'i-2');
    const slot = component('ActionSlot', { instanceId, canvasId: 'main', definitionId: 'card' }, children(r, depth + 1, slots));
    return r() < 0.7 ? { ...slot, key: instanceId } : slot;
  }
  const picked = pick(r, 'Box', 'Box', 'Box', 'Press', 'Cells', 'Reads', 'Timer', 'Leaf');
  const ref = r() < 0.4 ? pick(r, 'r1', 'r2', 'r3') : undefined;
  // A Box that carries `r3` is a Marks: decided from rolls already made, so
  // the seeds named below stay the runs they name.
  const name = picked === 'Box' && ref === 'r3' ? 'Marks' : picked;
  return component(name, props(r, picked), picked === 'Leaf' ? [] : children(r, depth + 1, slots), ref);
};

const changed = (r: Rng, tree: RenderNode, depth: number, slots: boolean): RenderNode => {
  if (r() > 0.25) {
    if (tree.type === 'component' || tree.type === 'fragment') return { ...tree, children: tree.children.map((child) => changed(r, child, depth + 1, slots)) };
    return tree;
  }
  if (tree.type === 'text') return { ...tree, value: pick(r, ...WORDS) };
  if (tree.type === 'error') return { ...tree, message: pick(r, ...WORDS) };
  if (tree.type === 'fragment') {
    const roll = r();
    if (roll < 0.4) return { ...tree, children: shuffled(r, tree.children) };
    if (roll < 0.7) return { ...tree, children: tree.children.slice(0, Math.floor(r() * (tree.children.length + 1))) };
    return node(r, depth, slots);
  }
  if (tree.name === 'CanvasSlot') return tree;
  const roll = r();
  if (roll < 0.3) return { ...tree, props: { ...tree.props, ...props(r, tree.name) } };
  if (roll < 0.5 && tree.name !== 'Leaf') return { ...tree, children: [...tree.children, node(r, depth + 1, slots)] };
  if (roll < 0.7) return { ...tree, children: tree.children.slice(1) };
  if (roll < 0.8 && tree.name === 'ActionSlot') return { ...tree, props: { ...tree.props, instanceId: pick(r, 'i-1', 'i-2') } };
  return node(r, depth, slots);
};

type Trees = { main: RenderNode[]; inner: RenderNode[]; other: RenderNode[] };
const fresh = (r: Rng): Trees => ({ main: children(r, 1, true), inner: children(r, 2, false), other: children(r, 2, false) });
const next = (r: Rng, trees: Trees): Trees =>
  r() < 0.25
    ? fresh(r)
    : {
        main: trees.main.map((tree) => changed(r, tree, 1, true)),
        inner: trees.inner.map((tree) => changed(r, tree, 2, false)),
        other: trees.other.map((tree) => changed(r, tree, 2, false)),
      };

const el = (tag: string, tone: unknown, kids: Node[]): HTMLElement => {
  const node = document.createElement(tag);
  if (typeof tone === 'string') node.setAttribute('data-tone', tone);
  node.append(...kids);
  return node;
};
const Box: DomComponent = ({ props, children }) => el('div', props['tone'], children);
const Press: DomComponent = ({ children }) => el('button', undefined, children);
const Leaf: DomComponent = ({ props }) => el('span', undefined, [document.createTextNode(String(props['label']))]);
const Cells: DomComponent = ({ props, children }) =>
  el(
    'div',
    props['tone'],
    children.map((child) => el('div', 'cell', [child])),
  );
const Reads: DomComponent = ({ children }) => el('p', undefined, [document.createTextNode(children.map((child) => child.textContent ?? '').join('|'))]);
const Marks: DomComponent = ({ props, children, dependsOnChildren }) => {
  dependsOnChildren();
  children.forEach((child, at) => {
    if (child instanceof HTMLElement) child.setAttribute('data-at', String(at));
  });
  return el('div', props['tone'], children);
};

type Drawn = { root: HTMLElement; render: () => void; destroy: () => void; dispatched: { canvasId: string; event: NovaEvent }[]; running: Set<HTMLElement>; started: () => number; stopped: () => number };

const draw = (trees: () => Trees): Drawn => {
  const dispatched: Drawn['dispatched'] = [];
  const running = new Set<HTMLElement>();
  let started = 0;
  let stopped = 0;
  const Timer: DomComponent = ({ props, children, onRemove }) => {
    const node = el('div', props['tone'], children);
    started += 1;
    running.add(node);
    onRemove(() => {
      stopped += 1;
      running.delete(node);
    });
    return node;
  };
  const registry = createComponentRegistry<DomComponent>();
  registry.registerAll({ Box, Press, Leaf, Cells, Reads, Marks, Timer, ActionSlot: Box });
  const root = document.createElement('div');
  document.body.appendChild(root);
  const view = createDomView(root, registry, {
    frame: () => [component('Box', {}, [component('CanvasSlot', { canvasId: 'main' }, [])])],
    canvasTree: (id) => (id === 'main' ? trees().main : id === 'inner' ? trees().inner : id === 'other' ? trees().other : []),
    dispatch: (canvasId, event) => dispatched.push({ canvasId, event }),
    publish: () => undefined,
  });
  view.render();
  return { root, render: view.render, destroy: view.destroy, dispatched, running, started: () => started, stopped: () => stopped };
};

const pressAll = (drawn: Drawn): Drawn['dispatched'] => {
  drawn.dispatched.length = 0;
  for (const target of drawn.root.querySelectorAll<HTMLElement>('[data-ref]')) target.click();
  return [...drawn.dispatched];
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('dom adapter — a patched page reads the same as one drawn from nothing', () => {
  const STEPS = 120;
  // 1009 and 271828 are runs in which a component that wraps each child has one
  // child and is given a second; in 5077, 5150 and 5285 one is handed a child
  // that draws nothing (an empty loop).
  for (const seed of [1, 7, 42, 1009, 5077, 5150, 5285, 31337, 271828]) {
    it(`seed ${seed}: ${STEPS} trees, each held to a page drawn from scratch`, () => {
      const r = seeded(seed);
      let trees = fresh(r);
      const live = draw(() => trees);
      for (let step = 0; step < STEPS; step += 1) {
        trees = next(r, trees);
        live.render();

        const scratch = draw(() => trees);
        expect(live.root.innerHTML, `markup, step ${step}`).toBe(scratch.root.innerHTML);
        expect(pressAll(live), `presses, step ${step}`).toEqual(pressAll(scratch));
        scratch.destroy();
        scratch.root.remove();

        const observer = new MutationObserver(() => undefined);
        observer.observe(live.root, { childList: true, subtree: true, attributes: true, characterData: true });
        live.render();
        expect(observer.takeRecords().length, `a second render of step ${step}`).toBe(0);
        observer.disconnect();

        for (const timer of live.root.querySelectorAll<HTMLElement>('[data-component="Timer"]')) expect(live.running.has(timer), `a timer on the page, step ${step}`).toBe(true);
      }
      live.destroy();
      expect(live.running.size).toBe(0);
      expect(live.stopped()).toBe(live.started());
    });
  }
});
