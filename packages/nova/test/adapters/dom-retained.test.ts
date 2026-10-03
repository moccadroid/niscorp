// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionDefinition } from '@action';
import { createShell, shellSettled, ACTION_SLOT_NAME, CANVAS_SLOT_NAME } from '@shell';
import type { Shell } from '@shell';
import { createComponentRegistry } from '../../src/layout';
import { createDomView, mountShell } from '../../src/adapters/dom';
import type { DomComponent, DomView } from '../../src/adapters/dom';
import { renderToString } from '../../src/adapters/dom/server';
import { defaultRegistry, fallback } from '../../src/adapters/dom/components';
import type { NovaEvent } from '../../src/shared/event-bus/schemas';
import type { RenderComponentNode, RenderNode } from '../../src/layout/types';

// ═══════════════════════════════════════════════════════════
// The DOM adapter keeps what did not change. After a render, an element whose
// part of the tree is the same as before is the SAME DOM node, and was never
// taken off the page — so it keeps what the tree does not hold: focus, scroll,
// an open <details>, a running animation, a timer its component started.
//
// "The same node" is asserted with `toBe`; "never taken off the page" with a
// MutationObserver over the root, because an element that is removed and put
// straight back is the same node and has still lost all of the above.
// ═══════════════════════════════════════════════════════════

const component = (name: string, props: Record<string, unknown> = {}, children: RenderNode[] = [], ref?: string): RenderComponentNode => ({
  type: 'component',
  name,
  props,
  children,
  ...(ref === undefined ? {} : { ref }),
});
const text = (value: string): RenderNode => ({ type: 'text', value });
const slot = (canvasId: string): RenderNode => component('CanvasSlot', { canvasId });
const keyedAs = (key: string, node: RenderComponentNode): RenderNode => ({ ...node, key });
const loop = (children: RenderNode[]): RenderNode => ({ type: 'fragment', children });
const bound = (name: string, props: Record<string, unknown>, ref?: string): RenderNode => ({
  ...component(name, props, [], ref),
  model: { ref: ref ?? 'auto:name', path: 'name' },
});
// the per-instance boundary, as a served tree carries it
const card = (instanceId: string, children: RenderNode[]): RenderNode => keyedAs(instanceId, component('ActionSlot', { instanceId, canvasId: 'tray', definitionId: 'card' }, children));

const Box: DomComponent = ({ props, children }) => {
  const el = document.createElement('div');
  if (typeof props['tone'] === 'string') el.setAttribute('data-tone', props['tone']);
  el.append(...children);
  return el;
};
const Press: DomComponent = ({ children }) => {
  const el = document.createElement('button');
  el.append(...children);
  return el;
};
const Field: DomComponent = ({ props }) => {
  const el = document.createElement('input');
  if (typeof props['value'] === 'string') el.value = props['value'];
  if (typeof props['placeholder'] === 'string') el.placeholder = props['placeholder'];
  return el;
};
// puts each child in a cell of its own: its children do not share one parent
const Cells: DomComponent = ({ children }) => {
  const el = document.createElement('div');
  for (const child of children) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.append(child);
    el.append(cell);
  }
  return el;
};
// reads its children and does not put them on the page
const Reads: DomComponent = ({ children }) => {
  const el = document.createElement('p');
  el.textContent = children.map((child) => child.textContent ?? '').join('|');
  return el;
};

type Stage = {
  root: HTMLElement;
  view: DomView;
  dispatched: { canvasId: string; event: NovaEvent }[];
  // every component asked for an element, in order
  built: string[];
};

// A view over trees the test holds and changes — driven the way moss's terminal
// drives it: change what the api returns, call `render`.
const stage = (frame: () => RenderNode[], trees: () => Record<string, RenderNode[]> = () => ({}), extra: Record<string, DomComponent> = {}): Stage => {
  const dispatched: Stage['dispatched'] = [];
  const built: string[] = [];
  const registry = createComponentRegistry<DomComponent>();
  for (const [name, build] of Object.entries({ Box, Press, Field, Cells, Reads, ActionSlot: Box, ...extra })) {
    registry.register(name, (ctx) => {
      built.push(name);
      return build(ctx);
    });
  }
  const root = document.createElement('div');
  document.body.appendChild(root);
  const view = createDomView(root, registry, {
    frame,
    canvasTree: (id) => trees()[id] ?? [],
    dispatch: (canvasId, event) => dispatched.push({ canvasId, event }),
    publish: () => undefined,
  });
  view.render();
  built.length = 0;
  return { root, view, dispatched, built };
};

// Every node taken out of the root's subtree while `during` runs — moved ones included.
const removedDuring = (root: HTMLElement, during: () => void): Set<Node> => {
  const removed = new Set<Node>();
  const observer = new MutationObserver(() => undefined);
  observer.observe(root, { childList: true, subtree: true });
  during();
  for (const record of observer.takeRecords()) for (const node of record.removedNodes) removed.add(node);
  observer.disconnect();
  return removed;
};

const elementsOf = (root: HTMLElement): Element[] => [...root.querySelectorAll('*')];
const one = <T extends Element>(root: ParentNode, selector: string): T => {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`nothing matches ${selector}`);
  return found;
};
const type = (el: HTMLInputElement, value: string): void => {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('dom adapter — what did not change stays', () => {
  it('a change in one instance on a list canvas leaves the other instance where it is', () => {
    let first = 'one';
    const { root, view, built } = stage(
      () => [slot('tray')],
      () => ({ tray: [loop([card('i-1', [component('Box', {}, [text(first)])]), card('i-2', [component('Box', {}, [text('two')])])])] }),
    );
    const [, other] = root.querySelectorAll('[data-component="ActionSlot"]');
    const before = elementsOf(root);
    first = 'changed';
    const removed = removedDuring(root, view.render);
    expect(root.querySelectorAll('[data-component="ActionSlot"]')[1]).toBe(other);
    expect(elementsOf(root)).toEqual(before);
    expect(removed.size).toBe(0);
    expect(built).toEqual([]);
    expect(root.textContent).toBe('changedtwo');
  });

  it('a change on one canvas leaves the other canvas where it is', () => {
    let left = 'left';
    const { root, view, built } = stage(
      () => [slot('a'), slot('b')],
      () => ({ a: [component('Box', {}, [text(left)])], b: [component('Box', {}, [component('Press', {}, [text('right')], 'go')])] }),
    );
    const right = one(root, '[data-canvas="b"]');
    const button = one(root, '[data-ref="go"]');
    left = 'moved on';
    const removed = removedDuring(root, view.render);
    expect(one(root, '[data-canvas="b"]')).toBe(right);
    expect(one(root, '[data-ref="go"]')).toBe(button);
    expect(removed.size).toBe(0);
    expect(built).toEqual([]);
    expect(one(root, '[data-canvas="a"]').textContent).toBe('moved on');
  });

  it('one changed string is one text node written: no element is built, none leaves the page', () => {
    let title = 'before';
    const { root, view, built } = stage(
      () => [slot('main')],
      () => ({ main: [component('Box', {}, [component('Box', {}, [text(title)], 'title'), component('Box', {}, [text('beside it')])])] }),
    );
    const before = elementsOf(root);
    const node = one(root, '[data-ref="title"]').firstChild;
    title = 'after';
    const removed = removedDuring(root, view.render);
    expect(elementsOf(root)).toEqual(before);
    expect(one(root, '[data-ref="title"]').firstChild).toBe(node);
    expect(node?.nodeValue).toBe('after');
    expect(removed.size).toBe(0);
    expect(built).toEqual([]);
  });
});

describe('dom adapter — a keyed list', () => {
  const list = (ids: string[]): RenderNode[] => [component('Box', {}, [loop(ids.map((id) => keyedAs(id, component('Box', {}, [text(id)]))))], 'list')];
  const rows = (root: HTMLElement): Element[] => [...one(root, '[data-ref="list"]').children];

  it('reordered: the same nodes in the new order, and only the one that moved is taken out', () => {
    let ids = ['a', 'b', 'c', 'd'];
    const { root, view, built } = stage(() => [slot('main')], () => ({ main: list(ids) }));
    const [a, b, c, d] = rows(root);
    ids = ['b', 'c', 'd', 'a'];
    const removed = removedDuring(root, view.render);
    expect(rows(root)).toEqual([b, c, d, a]);
    expect([...removed]).toEqual([a]);
    expect(built).toEqual([]);
  });

  it('one removed: it is gone, and its siblings were not touched', () => {
    let ids = ['a', 'b', 'c'];
    const { root, view, built } = stage(() => [slot('main')], () => ({ main: list(ids) }));
    const [a, b, c] = rows(root);
    ids = ['a', 'c'];
    const removed = removedDuring(root, view.render);
    expect(rows(root)).toEqual([a, c]);
    expect([...removed]).toEqual([b]);
    expect(built).toEqual([]);
  });

  it('one added: one element built, put between its neighbours', () => {
    let ids = ['a', 'c'];
    const { root, view, built } = stage(() => [slot('main')], () => ({ main: list(ids) }));
    const [a, c] = rows(root);
    ids = ['a', 'b', 'c'];
    const removed = removedDuring(root, view.render);
    expect(rows(root)[0]).toBe(a);
    expect(rows(root)[2]).toBe(c);
    expect(rows(root)[1]?.textContent).toBe('b');
    expect(removed.size).toBe(0);
    expect(built).toEqual(['Box']);
  });

  it('reversed: the same nodes, back to front — nothing is built', () => {
    let ids = ['a', 'b', 'c', 'd', 'e'];
    const { root, view, built } = stage(() => [slot('main')], () => ({ main: list(ids) }));
    const before = rows(root);
    ids = [...ids].reverse();
    view.render();
    expect(rows(root)).toEqual([...before].reverse());
    expect(built).toEqual([]);
  });

  it('several new rows side by side go in between their neighbours, in order', () => {
    let ids = ['a', 'e'];
    const { root, view, built } = stage(() => [slot('main')], () => ({ main: list(ids) }));
    const [a, e] = rows(root);
    ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const removed = removedDuring(root, view.render);
    expect(rows(root).map((row) => row.textContent)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(rows(root)[0]).toBe(a);
    expect(rows(root)[4]).toBe(e);
    expect(removed.size).toBe(0);
    expect(built).toEqual(['Box', 'Box', 'Box', 'Box']);
  });

  it('every row replaced by another: all new, in order, and the list itself stays', () => {
    let ids = ['a', 'b', 'c'];
    const { root, view, built } = stage(() => [slot('main')], () => ({ main: list(ids) }));
    const holder = one(root, '[data-ref="list"]');
    const before = rows(root);
    ids = ['x', 'y', 'z', 'w'];
    view.render();
    expect(one(root, '[data-ref="list"]')).toBe(holder);
    expect(rows(root).map((row) => row.textContent)).toEqual(['x', 'y', 'z', 'w']);
    expect(rows(root).some((row) => before.includes(row))).toBe(false);
    expect(built).toEqual(['Box', 'Box', 'Box', 'Box']);
  });

  it('a node the adapter did not put on a canvas is left where it is', () => {
    let ids = ['a', 'b'];
    const { root, view } = stage(
      () => [slot('main')],
      () => ({ main: ids.map((id) => keyedAs(id, component('Box', {}, [text(id)]))) }),
    );
    const foreign = document.createElement('aside');
    one(root, '[data-canvas="main"]').append(foreign);
    ids = ['x', 'y'];
    view.render();
    expect(foreign.isConnected).toBe(true);
    expect([...one(root, '[data-canvas="main"]').querySelectorAll('[data-component="Box"]')].map((el) => el.textContent)).toEqual(['x', 'y']);
  });

  it('siblings that share a ref and carry no key are told apart by order, and both stay', () => {
    let label = 'x';
    const { root, view, dispatched, built } = stage(
      () => [slot('main')],
      () => ({ main: [component('Box', {}, [component('Press', { value: 1 }, [text('one')], 'go'), component('Press', { value: 2 }, [text('two')], 'go'), text(label)])] }),
    );
    const [first, second] = root.querySelectorAll<HTMLElement>('[data-ref="go"]');
    label = 'y';
    view.render();
    expect([...root.querySelectorAll('[data-ref="go"]')]).toEqual([first, second]);
    expect(built).toEqual([]);
    first?.click();
    second?.click();
    expect(dispatched.map(({ event }) => (event.type === 'ui:click' ? event.payload : undefined))).toEqual([1, 2]);
  });
});

describe('dom adapter — only what must be built is built', () => {
  it('a component whose own props changed is built again: its children are the same nodes, its siblings are not touched', () => {
    let tone = 'paper';
    const { root, view, built } = stage(
      () => [slot('main')],
      () => ({ main: [component('Box', {}, [component('Box', { tone }, [component('Press', {}, [text('inside')], 'inside')], 'toned'), component('Box', {}, [text('beside')], 'beside')])] }),
    );
    const toned = one(root, '[data-ref="toned"]');
    const inside = one(root, '[data-ref="inside"]');
    const beside = one(root, '[data-ref="beside"]');
    tone = 'ink';
    const removed = removedDuring(root, view.render);
    expect(one(root, '[data-ref="toned"]')).not.toBe(toned);
    expect(one(root, '[data-ref="toned"]').getAttribute('data-tone')).toBe('ink');
    expect(one(root, '[data-ref="inside"]')).toBe(inside);
    expect(one(root, '[data-ref="beside"]')).toBe(beside);
    expect(removed.has(beside)).toBe(false);
    expect(built).toEqual(['Box']);
  });

  it('a different instance in the same place is all new, and its presses are its own', () => {
    // un-keyed on purpose: nothing but the slot's own identity says the instance changed
    let instanceId = 'i-1';
    const { root, view, dispatched } = stage(
      () => [slot('deck')],
      () => ({ deck: [component('ActionSlot', { instanceId, canvasId: 'deck', definitionId: 'card' }, [component('Press', {}, [text('same words')], 'go')])] }),
    );
    const before = elementsOf(one(root, '[data-canvas="deck"]'));
    instanceId = 'i-2';
    view.render();
    const after = elementsOf(one(root, '[data-canvas="deck"]'));
    expect(after.some((el) => before.includes(el))).toBe(false);
    one<HTMLElement>(root, '[data-ref="go"]').click();
    expect(dispatched).toEqual([{ canvasId: 'deck', event: { type: 'ui:click', ref: 'go', origin: 'i-2' } }]);
  });

  it('a component going from children to none, and back, is asked again — it may draw itself differently when empty', () => {
    const draw = (labelled: boolean): { root: HTMLElement; view: DomView; set: (next: boolean) => void } => {
      let on = labelled;
      const root = document.createElement('div');
      document.body.appendChild(root);
      const view = createDomView(
        root,
        defaultRegistry(),
        { frame: () => [slot('main')], canvasTree: () => [component('Button', { icon: 'close' }, on ? [text('label')] : [], 'b')], dispatch: () => undefined, publish: () => undefined },
        { fallback },
      );
      view.render();
      return { root, view, set: (next) => void (on = next) };
    };
    const empty = one(draw(false).root, '[data-ref="b"]').outerHTML;
    const labelled = one(draw(true).root, '[data-ref="b"]').outerHTML;
    expect(empty).not.toBe(labelled);

    const live = draw(true);
    live.set(false);
    live.view.render();
    expect(one(live.root, '[data-ref="b"]').outerHTML).toBe(empty);
    live.set(true);
    live.view.render();
    expect(one(live.root, '[data-ref="b"]').outerHTML).toBe(labelled);
  });

  it('a component that wraps each child: a change inside a child is patched where it stands; a change to which children it has asks it again', () => {
    let inner = 'one';
    let third = false;
    const { root, view, built } = stage(
      () => [slot('main')],
      () => ({
        main: [component('Cells', {}, [component('Box', {}, [text(inner)], 'a'), component('Box', {}, [text('two')], 'b'), ...(third ? [component('Box', {}, [text('three')], 'c')] : [])], 'cells')],
      }),
    );
    const cells = one(root, '[data-ref="cells"]');
    const a = one(root, '[data-ref="a"]');
    inner = 'changed';
    const removed = removedDuring(root, view.render);
    expect(one(root, '[data-ref="cells"]')).toBe(cells);
    expect(a.textContent).toBe('changed');
    expect(removed.size).toBe(0);
    expect(built).toEqual([]);

    third = true;
    view.render();
    expect(one(root, '[data-ref="cells"]')).not.toBe(cells);
    expect(root.querySelectorAll('.cell').length).toBe(3);
    expect(one(root, '[data-ref="a"]')).toBe(a);
    expect(built).toEqual(['Box', 'Cells']);
  });

  it('a component that wraps each child, with ONE child: a second is a second cell, not a second node in the first', () => {
    // with a single child, a kit that wraps each child and one that wraps them
    // all look the same — so neither is patched in place
    let second = false;
    const { root, view } = stage(
      () => [slot('main')],
      () => ({ main: [component('Cells', {}, [component('Box', {}, [text('one')], 'a'), ...(second ? [component('Box', {}, [text('two')], 'b')] : [])], 'cells')] }),
    );
    const a = one(root, '[data-ref="a"]');
    second = true;
    view.render();
    expect(root.querySelectorAll('.cell').length).toBe(2);
    expect(one(root, '[data-ref="b"]').parentElement).not.toBe(a.parentElement);
    expect(one(root, '[data-ref="a"]')).toBe(a);
  });

  it('a component with something of its own beside its children is asked again when it gets another', () => {
    const Titled: DomComponent = ({ props, children }) => {
      const el = document.createElement('section');
      const title = document.createElement('h2');
      title.textContent = `${String(props['title'])} (${children.length})`;
      el.append(title, ...children);
      return el;
    };
    let more = false;
    const { root, view, built } = stage(
      () => [slot('main')],
      () => ({ main: [component('Titled', { title: 'things' }, [component('Box', {}, [text('one')], 'a'), ...(more ? [component('Box', {}, [text('two')])] : [])], 'titled')] }),
      { Titled },
    );
    const a = one(root, '[data-ref="a"]');
    more = true;
    view.render();
    expect(one(root, 'h2').textContent).toBe('things (2)');
    expect(one(root, '[data-ref="a"]')).toBe(a);
    expect(built).toEqual(['Box', 'Titled']);
  });

  it('a child that draws nothing still counts as a child to a component that wraps each one', () => {
    let empty = false;
    const { root, view } = stage(
      () => [slot('main')],
      () => ({ main: [component('Cells', {}, [component('Box', {}, [text('one')]), component('Box', {}, [text('two')]), ...(empty ? [loop([])] : [])], 'cells')] }),
    );
    empty = true;
    view.render();
    expect(root.querySelectorAll('.cell').length).toBe(3);
  });

  it('a component that marks its children says so: it is asked again when they change, and every one of them carries the right mark', () => {
    // holds exactly its children — so, unsaid, it would look like a component
    // that only holds them, and a child put in beside the others would go unmarked
    const Marks: DomComponent = ({ children, dependsOnChildren }) => {
      dependsOnChildren();
      const el = document.createElement('div');
      children.forEach((child, at) => {
        if (child instanceof HTMLElement) child.setAttribute('data-at', String(at));
      });
      el.append(...children);
      return el;
    };
    let ids = ['a', 'b'];
    let word = 'x';
    const { root, view, built } = stage(
      () => [slot('main')],
      () => ({ main: [component('Marks', {}, ids.map((id) => keyedAs(id, component('Box', {}, [text(`${id}${word}`)], id))), 'marks')] }),
      { Marks },
    );
    const marksOf = (): string[] => [...one(root, '[data-ref="marks"]').children].map((child) => `${child.getAttribute('data-ref') ?? ''}@${child.getAttribute('data-at') ?? ''}`);
    const a = one(root, '[data-ref="a"]');
    expect(marksOf()).toEqual(['a@0', 'b@1']);

    word = 'y'; // a change inside a child is not a change of children
    view.render();
    expect(built).toEqual([]);
    expect(a.textContent).toBe('ay');

    ids = ['c', 'a', 'b'];
    view.render();
    expect(marksOf()).toEqual(['c@0', 'a@1', 'b@2']);
    expect(one(root, '[data-ref="a"]')).toBe(a);
    expect(built).toEqual(['Box', 'Marks']);
  });

  it('a component that does not put its children on the page is asked again when they change', () => {
    let word = 'first';
    const { root, view, built } = stage(() => [slot('main')], () => ({ main: [component('Reads', {}, [text(word), text('fixed')], 'reads')] }));
    expect(one(root, '[data-ref="reads"]').textContent).toBe('first|fixed');
    view.render();
    expect(built).toEqual([]);
    word = 'second';
    view.render();
    expect(one(root, '[data-ref="reads"]').textContent).toBe('second|fixed');
    expect(built).toEqual(['Reads']);
  });

  it('a canvas placed under a component that wraps its children still follows its own tree', () => {
    let inner = 'before';
    const { root, view, built } = stage(
      () => [slot('outer')],
      () => ({ outer: [component('Cells', {}, [slot('inner')], 'cells')], inner: [component('Box', {}, [text(inner)])] }),
    );
    const cells = one(root, '[data-ref="cells"]');
    const host = one(root, '[data-canvas="inner"]');
    inner = 'after';
    view.render();
    expect(one(root, '[data-canvas="inner"]')).toBe(host);
    expect(host.textContent).toBe('after');
    expect(one(root, '[data-ref="cells"]')).toBe(cells);
    expect(built).toEqual([]);
  });
});

describe('dom adapter — events on elements that stay', () => {
  it('a click after a change carries the current payload: on an element that stayed, and on one built again', () => {
    let pick = 'one';
    let beside = 'x';
    const { root, view, dispatched } = stage(
      () => [slot('main')],
      () => ({ main: [component('Box', {}, [component('Press', { value: pick }, [text('pick')], 'pick'), text(beside)])] }),
    );
    const stayed = one<HTMLElement>(root, '[data-ref="pick"]');
    beside = 'y';
    view.render();
    expect(one(root, '[data-ref="pick"]')).toBe(stayed);
    stayed.click();
    pick = 'two';
    view.render();
    expect(one(root, '[data-ref="pick"]')).not.toBe(stayed);
    one<HTMLElement>(root, '[data-ref="pick"]').click();
    expect(dispatched.map(({ event }) => (event.type === 'ui:click' ? event.payload : undefined))).toEqual(['one', 'two']);
  });

  it('debounce coalesces keystrokes across a render: one dispatch, the last value', () => {
    vi.useFakeTimers();
    const { root, view, dispatched } = stage(() => [slot('main')], () => ({ main: [bound('Field', { debounce: 30 }, 'q')] }));
    const field = one<HTMLInputElement>(root, 'input');
    field.focus();
    type(field, 'a');
    view.render(); // an update lands inside the debounce window
    expect(one(root, 'input')).toBe(field);
    type(field, 'ab');
    vi.advanceTimersByTime(100);
    expect(dispatched.map(({ event }) => (event.type === 'ui:model' ? event.payload : undefined))).toEqual(['ab']);
  });

  it('leaving a field sends what was still waiting, once', () => {
    vi.useFakeTimers();
    const { root, dispatched } = stage(() => [slot('main')], () => ({ main: [bound('Field', { debounce: 500 }, 'q')] }));
    const field = one<HTMLInputElement>(root, 'input');
    field.focus();
    type(field, 'typed');
    expect(dispatched).toEqual([]);
    field.blur();
    expect(dispatched.map(({ event }) => (event.type === 'ui:model' ? event.payload : undefined))).toEqual(['typed']);
    vi.advanceTimersByTime(1000);
    expect(dispatched.length).toBe(1);
  });
});

describe('dom adapter — focus and bound fields', () => {
  it('a focused button keeps focus across a change elsewhere', () => {
    let beside = 'x';
    const { root, view } = stage(() => [slot('main')], () => ({ main: [component('Box', {}, [component('Press', {}, [text('go')], 'go'), text(beside)])] }));
    const button = one<HTMLElement>(root, '[data-ref="go"]');
    button.focus();
    beside = 'y';
    view.render();
    expect(document.activeElement).toBe(button);
  });

  it('a focused button that has to be built again: focus is on the element built in its place', () => {
    let value = 1;
    const { root, view } = stage(() => [slot('main')], () => ({ main: [component('Press', { value }, [text('go')], 'go')] }));
    const button = one<HTMLElement>(root, '[data-ref="go"]');
    button.focus();
    value = 2;
    view.render();
    expect(one(root, '[data-ref="go"]')).not.toBe(button);
    expect(document.activeElement).toBe(one(root, '[data-ref="go"]'));
  });

  it('a bound field is not replaced while it is typed in, and what is typed wins over the tree until it is left', () => {
    let value = '';
    const { root, view, built } = stage(() => [slot('main')], () => ({ main: [bound('Field', { value }, 'name')] }));
    const field = one<HTMLInputElement>(root, 'input');
    field.focus();
    type(field, 'hel');
    field.setSelectionRange(1, 1);
    value = 'hel'; // the echo
    view.render();
    expect(one(root, 'input')).toBe(field);
    expect(field.selectionStart).toBe(1);

    value = 'HEL'; // the tree says something else while the field is focused
    view.render();
    expect(one(root, 'input')).toBe(field);
    expect(field.value).toBe('hel');
    expect(document.activeElement).toBe(field);
    expect(built).toEqual([]);

    field.blur(); // released: the next render shows the tree's value
    view.render();
    expect(one<HTMLInputElement>(root, 'input').value).toBe('HEL');

    const settled = one(root, 'input');
    view.render();
    expect(one(root, 'input')).toBe(settled);
  });

  it('a focused field built again for another prop keeps what was typed, the caret, and focus', () => {
    let placeholder = 'your name';
    const { root, view } = stage(() => [slot('main')], () => ({ main: [bound('Field', { value: '', placeholder }, 'name')] }));
    const field = one<HTMLInputElement>(root, 'input');
    field.focus();
    type(field, 'typed');
    field.setSelectionRange(2, 4);
    placeholder = 'who are you';
    view.render();
    const rebuilt = one<HTMLInputElement>(root, 'input');
    expect(rebuilt).not.toBe(field);
    expect(rebuilt.placeholder).toBe('who are you');
    expect(rebuilt.value).toBe('typed');
    expect([rebuilt.selectionStart, rebuilt.selectionEnd]).toEqual([2, 4]);
    expect(document.activeElement).toBe(rebuilt);
  });

  it('a checkbox is not typed in: the tree shows at once, and focus stays with it', () => {
    const Tick: DomComponent = ({ props }) => {
      const el = document.createElement('input');
      el.type = 'checkbox';
      el.checked = props['value'] === true;
      return el;
    };
    const { root, view, dispatched } = stage(() => [slot('main')], () => ({ main: [bound('Tick', { value: false }, 'agree')] }), { Tick });
    const box = one<HTMLInputElement>(root, 'input');
    box.focus();
    box.checked = true; // pressed…
    box.dispatchEvent(new Event('input', { bubbles: true }));
    expect(dispatched.map(({ event }) => (event.type === 'ui:model' ? event.payload : undefined))).toEqual([true]);
    view.render(); // …and the tree still says no (the press was refused)
    expect(one<HTMLInputElement>(root, 'input').checked).toBe(false);
    expect(document.activeElement).toBe(one(root, 'input'));
  });

  it('the first render over markup drawn ahead of time: somebody already typing in it keeps their words, their caret and their place', () => {
    const frame = (): RenderNode[] => [slot('tray')];
    const trees = (): Record<string, RenderNode[]> => ({
      tray: [loop([card('i-1', [bound('Field', { value: '' }, 'name')]), card('i-2', [bound('Field', { value: '' }, 'name')])])],
    });
    const drawn = stage(frame, trees);
    const markup = drawn.root.innerHTML;
    drawn.view.destroy();

    // the page arrives with that markup, and is typed in before its script runs
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.innerHTML = markup;
    const [, early] = root.querySelectorAll<HTMLInputElement>('input');
    if (early === undefined) throw new Error('no second field in the markup');
    early.focus();
    early.value = 'already here';
    early.setSelectionRange(3, 3);

    const registry = createComponentRegistry<DomComponent>();
    registry.registerAll({ Box, Field, ActionSlot: Box });
    createDomView(root, registry, { frame, canvasTree: (id) => trees()[id] ?? [], dispatch: () => undefined, publish: () => undefined }).render();
    const [first, second] = root.querySelectorAll<HTMLInputElement>('input');
    expect(second).not.toBe(early);
    expect(document.activeElement).toBe(second);
    expect(second?.value).toBe('already here');
    expect(second?.selectionStart).toBe(3);
    expect(first?.value).toBe('');
    expect(root.innerHTML).toBe(markup);
  });

  it('a bound field with no ref of its own keeps focus, on the same element', () => {
    let value = '';
    const { root, view } = stage(() => [slot('main')], () => ({ main: [component('Box', {}, [bound('Field', { value }), text(value)])] }));
    const field = one<HTMLInputElement>(root, 'input');
    expect(field.hasAttribute('data-ref')).toBe(false);
    field.focus();
    type(field, 'h');
    value = 'h';
    view.render();
    expect(one(root, 'input')).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(root.textContent).toBe('h');
  });
});

describe('dom adapter — a shell in the page', () => {
  const kit = (): ReturnType<typeof defaultRegistry> => {
    const registry = defaultRegistry();
    registry.register(CANVAS_SLOT_NAME, fallback);
    registry.register(ACTION_SLOT_NAME, fallback);
    return registry;
  };
  const cardAction: ActionDefinition = {
    id: 'card',
    data: { name: '', n: 0, tree: { a: { b: 1 } } },
    layout: {
      component: 'Stack',
      children: [
        { component: 'Input', model: '$.name', ref: 'name' },
        { component: 'Button', ref: 'bump', children: 'bump' },
        { component: 'Text', children: '$.n' },
        { component: 'JsonTree', props: { value: '$.tree' } },
      ],
    },
    triggers: [{ event: 'ui:click', ref: 'bump', do: [{ increment: 'n' }] }],
  };
  const tray = async (): Promise<{ shell: Shell; root: HTMLElement; cards: () => Element[] }> => {
    let minted = 0;
    const shell = createShell({
      registry: kit(),
      canvases: [{ id: 'main', mode: 'list', actionLayout: { for: '$.instances', as: 'it', key: 'id', do: { component: 'ActionSlot', props: { instanceId: '$it.id' } } }, initial: ['card', 'card'] }],
      actions: { card: cardAction },
      instanceIdFn: () => `i-${(minted += 1)}`,
    });
    await shellSettled(shell);
    const root = document.createElement('div');
    document.body.appendChild(root);
    mountShell(root, kit(), shell, { fallback });
    return { shell, root, cards: () => [...root.querySelectorAll('[data-component="ActionSlot"]')] };
  };
  const dataOf = (shell: Shell, at: number): Record<string, unknown> => shell.getRuntime(shell.getState().canvases['main']?.stack[at]?.id ?? '')?.getData() ?? {};

  it('two instances with the same ref: typing in the second stays in the second', async () => {
    const { shell, root, cards } = await tray();
    const fields = (): HTMLInputElement[] => [...root.querySelectorAll<HTMLInputElement>('input[data-ref="name"]')];
    const second = fields()[1];
    if (second === undefined) throw new Error('no second field');
    second.focus();
    type(second, 'typed in card two');
    await tick();
    expect(document.activeElement).toBe(second);
    expect(fields()).toEqual([fields()[0], second]);
    expect(fields()[0]?.value).toBe('');
    type(second, 'typed in card two!');
    await tick();
    expect(dataOf(shell, 0)['name']).toBe('');
    expect(dataOf(shell, 1)['name']).toBe('typed in card two!');
    expect(cards().length).toBe(2);
  });

  it('a pressed button keeps focus, and the press only writes its own count', async () => {
    const { root, cards } = await tray();
    const [first, second] = cards();
    const button = one<HTMLElement>(first ?? root, '[data-ref="bump"]');
    button.focus();
    const before = elementsOf(root);
    let removed = new Set<Node>();
    const observer = new MutationObserver(() => undefined);
    observer.observe(root, { childList: true, subtree: true });
    button.click();
    await tick();
    for (const record of observer.takeRecords()) for (const node of record.removedNodes) removed = removed.add(node);
    observer.disconnect();
    expect(document.activeElement).toBe(button);
    expect(elementsOf(root)).toEqual(before);
    expect(removed.size).toBe(0);
    expect(first?.textContent).toContain('1');
    expect(cards()[1]).toBe(second);
  });

  it('an open <details> stays open across a change beside it and a change elsewhere', async () => {
    const { shell, root, cards } = await tray();
    const details = one<HTMLDetailsElement>(cards()[0] ?? root, 'details');
    details.open = true;
    for (const at of [1, 0]) {
      const id = shell.getState().canvases['main']?.stack[at]?.id ?? '';
      shell.getRuntime(id)?.setData({ ...dataOf(shell, at), n: 5 });
    }
    await tick();
    expect(one(cards()[0] ?? root, 'details')).toBe(details);
    expect(details.open).toBe(true);
    expect(root.textContent).toContain('5');
  });

  it('an instance replaced on a stack canvas is new elements', async () => {
    let minted = 0;
    const shell = createShell({ registry: kit(), canvases: [{ id: 'main', initial: 'card' }], actions: { card: cardAction }, instanceIdFn: () => `i-${(minted += 1)}` });
    await shellSettled(shell);
    const root = document.createElement('div');
    document.body.appendChild(root);
    mountShell(root, kit(), shell, { fallback });
    const before = elementsOf(one(root, '[data-canvas="main"]'));
    shell.replace('main', 'card');
    await tick();
    const after = elementsOf(one(root, '[data-canvas="main"]'));
    expect(after.length).toBe(before.length);
    expect(after.some((el) => before.includes(el))).toBe(false);
  });
});

describe('dom adapter — onRemove: the other end of what a component starts', () => {
  const stopped: string[] = [];
  const Timer: DomComponent = ({ props, children, onRemove }) => {
    const el = document.createElement('div');
    el.append(...children);
    const name = String(props['name']);
    if (typeof props['tone'] === 'string') el.setAttribute('data-tone', props['tone']);
    onRemove(() => stopped.push(name));
    return el;
  };
  afterEach(() => {
    stopped.length = 0;
  });

  it('runs once when the element is removed, when it is replaced, and when the view is destroyed', () => {
    let shown = ['a', 'b'];
    let tone = 'paper';
    const { view } = stage(
      () => [slot('main')],
      () => ({ main: [component('Box', {}, [loop(shown.map((name) => keyedAs(name, component('Timer', { name, ...(name === 'b' ? { tone } : {}) }))))])] }),
      { Timer },
    );
    shown = ['b'];
    view.render();
    expect(stopped).toEqual(['a']);
    tone = 'ink'; // its own props: the element is replaced, and the new one starts again
    view.render();
    expect(stopped).toEqual(['a', 'b']);
    view.destroy();
    expect(stopped).toEqual(['a', 'b', 'b']);
  });

  it('does not run for an element that stays — nor for one moved under a parent that was built again', () => {
    let tone = 'paper';
    let beside = 'x';
    const { root, view } = stage(
      () => [slot('main')],
      () => ({ main: [component('Box', { tone }, [component('Timer', { name: 'kept' }, [], 'timer'), text(beside)], 'parent')] }),
      { Timer },
    );
    const timer = one(root, '[data-ref="timer"]');
    beside = 'y';
    view.render();
    tone = 'ink';
    view.render();
    expect(one(root, '[data-ref="parent"]').getAttribute('data-tone')).toBe('ink');
    expect(one(root, '[data-ref="timer"]')).toBe(timer);
    expect(stopped).toEqual([]);
  });

  it('runs for everything inside an instance that leaves', () => {
    let instanceId = 'i-1';
    const { view } = stage(
      () => [slot('deck')],
      () => ({ deck: [card(instanceId, [component('Box', {}, [component('Timer', { name: instanceId })])])] }),
      { Timer },
    );
    instanceId = 'i-2';
    view.render();
    expect(stopped).toEqual(['i-1']);
  });

  it('renderToString stops what its draw started', () => {
    const registry = createComponentRegistry<DomComponent>();
    registry.register('Timer', Timer);
    const markup = renderToString(registry, { frame: () => [component('Timer', { name: 'drawn' }, [text('ticking')])], canvasTree: () => [], dispatch: () => undefined, publish: () => undefined }, { window });
    expect(markup).toBe('<div data-component="Timer">ticking</div>');
    expect(stopped).toEqual(['drawn']);
  });
});
