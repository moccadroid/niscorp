// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createComponentRegistry } from '../../src/layout';
import { createDomView } from '../../src/adapters/dom';
import type { DomComponent, DomRenderApi } from '../../src/adapters/dom';
import type { NovaEvent } from '../../src/shared/event-bus/schemas';
import type { RenderComponentNode, RenderNode } from '../../src/layout/types';

// ═══════════════════════════════════════════════════════════
// The DOM adapter resolves a CanvasSlot WHEREVER it appears — in the frame, or
// inside a canvas's own tree (an action that arranges canvases). Inside a slot,
// events are that canvas's: a click in a nested canvas is dispatched as the
// NESTED canvas's, not the canvas around it. Driven the way moss's terminal
// drives it, with a stub RenderApi.
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

const Box: DomComponent = ({ children }) => {
  const el = document.createElement('div');
  el.append(...children);
  return el;
};
const Press: DomComponent = ({ children }) => {
  const el = document.createElement('button');
  el.append(...children);
  return el;
};

const mount = (frame: RenderNode[], trees: Record<string, RenderNode[]>) => {
  const dispatched: { canvasId: string; event: NovaEvent }[] = [];
  const api: DomRenderApi = {
    frame: () => frame,
    canvasTree: (id) => trees[id] ?? [],
    dispatch: (canvasId, event) => dispatched.push({ canvasId, event }),
    publish: () => undefined,
  };
  const registry = createComponentRegistry<DomComponent>();
  registry.registerAll({ Box, Press });
  const root = document.createElement('div');
  createDomView(root, registry, api).render();
  return { root, dispatched };
};

describe('dom adapter — a CanvasSlot inside a canvas', () => {
  const trees = {
    outer: [component('Box', {}, [component('Press', {}, [text('outer')], 'outerPress'), slot('inner')])],
    inner: [component('Press', {}, [text('inner')], 'innerPress')],
  };

  it('renders the nested canvas inside the canvas that placed it', () => {
    const { root } = mount([slot('outer')], trees);
    const inner = root.querySelector('[data-canvas="outer"] [data-canvas="inner"]');
    expect(inner).not.toBeNull();
    expect(inner?.textContent).toBe('inner');
  });

  it('a click in the nested canvas is the nested canvas\'s event', () => {
    const { root, dispatched } = mount([slot('outer')], trees);
    root.querySelector<HTMLElement>('[data-ref="innerPress"]')?.click();
    expect(dispatched).toEqual([{ canvasId: 'inner', event: { type: 'ui:click', ref: 'innerPress' } }]);
  });

  it('a click beside it is still the outer canvas\'s', () => {
    const { root, dispatched } = mount([slot('outer')], trees);
    root.querySelector<HTMLElement>('[data-ref="outerPress"]')?.click();
    expect(dispatched).toEqual([{ canvasId: 'outer', event: { type: 'ui:click', ref: 'outerPress' } }]);
  });
});
