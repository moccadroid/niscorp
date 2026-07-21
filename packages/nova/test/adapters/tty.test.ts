import { describe, it, expect } from 'vitest';
import { createTtyView } from '../../src/adapters/tty';
import type { TtyRenderApi } from '../../src/adapters/tty';
import { defaultRegistry, fallback } from '../../src/adapters/tty/components';
import type { RenderNode } from '../../src/layout/types';

// ═══════════════════════════════════════════════════════════
// The TTY adapter — pure render: served trees in, { text, interactives }
// out. Driven exactly the way moss's terminal/tty target drives it, with a
// stub RenderApi; no I/O anywhere.
// ═══════════════════════════════════════════════════════════

const component = (name: string, props: Record<string, unknown> = {}, children: RenderNode[] = []): RenderNode => ({
  type: 'component',
  name,
  props,
  children,
});
const text = (value: string): RenderNode => ({ type: 'text', value });

const makeApi = (frame: RenderNode[], trees: Record<string, RenderNode[]> = {}): TtyRenderApi => ({
  frame: () => frame,
  canvasTree: (id) => trees[id] ?? [],
  dispatch: () => undefined,
  publish: () => undefined,
});

const view = (frame: RenderNode[], trees: Record<string, RenderNode[]> = {}) =>
  createTtyView(defaultRegistry(), makeApi(frame, trees), { fallback }).render();

describe('tty view — frame and canvases', () => {
  it('prints a rule per non-empty canvas and collapses empty ones entirely', () => {
    const frame = [
      component('Stack', {}, [
        component('CanvasSlot', { canvasId: 'main' }),
        component('CanvasSlot', { canvasId: 'aside' }), // empty — collapses
      ]),
    ];
    const { text: out } = view(frame, { main: [text('hello')] });
    expect(out).toContain('── main ');
    expect(out).toContain('hello');
    expect(out).not.toContain('aside');
  });

  it('renders error nodes visibly and unknown components through the fallback', () => {
    const { text: out } = view([
      { type: 'error', code: 'E_BOOM', message: 'it broke' },
      component('KanbanBoard', {}, [text('card A')]),
      component('NavItem', { label: 'Deals', count: 4 }),
    ]);
    expect(out).toContain('!! E_BOOM: it broke');
    expect(out).toContain('card A'); // children render through the fallback
    expect(out).toContain('Deals (4)'); // childless fallback surfaces label + count
  });

  it('without a fallback an unknown name is a visible error, never a throw', () => {
    const api = makeApi([component('Mystery')]);
    const { text: out } = createTtyView(defaultRegistry(), api).render();
    expect(out).toContain('COMPONENT_NOT_FOUND: Mystery');
  });
});

describe('tty view — convention wiring', () => {
  it('a ref’d Button prints a marker and registers a click with its value payload', () => {
    const frame = [component('CanvasSlot', { canvasId: 'main' })];
    const tree = [{ ...component('Button', { value: 42 }, [text('Save')]), ref: 'save' }];
    const { text: out, interactives } = view(frame, { main: tree });
    expect(out).toContain('[1] (Save)');
    expect(interactives).toEqual([{ index: 1, kind: 'click', ref: 'save', canvas: 'main', label: '(Save)', value: 42 }]);
  });

  it('a model’d Input registers as model with its path and current value', () => {
    const frame = [component('CanvasSlot', { canvasId: 'main' })];
    const tree = [{ ...component('Input', { value: 'alex', placeholder: 'user' }), model: { path: 'form.user', ref: 'in-user' } }];
    const { text: out, interactives } = view(frame, { main: tree });
    expect(out).toContain('[1] ⟨alex⟩');
    expect(interactives[0]).toMatchObject({ kind: 'model', ref: 'in-user', path: 'form.user', value: 'alex', canvas: 'main' });
  });

  it('a model’d Checkbox with a boolean value registers as toggle', () => {
    const frame = [component('CanvasSlot', { canvasId: 'main' })];
    const tree = [{ ...component('Checkbox', { value: true }), model: { path: 'task.done', ref: 'chk' } }];
    const { text: out, interactives } = view(frame, { main: tree });
    expect(out).toContain('[1] ☑');
    expect(interactives[0]).toMatchObject({ kind: 'toggle', ref: 'chk', value: true });
  });

  it('frame chrome interactives register against no canvas', () => {
    const { interactives } = view([{ ...component('Button', {}, [text('Chrome')]), ref: 'chrome-btn' }]);
    expect(interactives[0]).toMatchObject({ ref: 'chrome-btn', canvas: '' });
  });
});

describe('tty view — the table', () => {
  const columns = [
    { label: 'title', cell: { key: 'title' } },
    { label: 'stage', cell: { key: 'stage' } },
  ];
  const rows = [
    { id: 'd1', title: 'Acme renewal', stage: 'won' },
    { id: 'd2', title: 'Initech intro', stage: 'lead' },
  ];

  it('aligns padded columns and registers each row when rowRef is set', () => {
    const frame = [component('CanvasSlot', { canvasId: 'main' })];
    const tree = [component('Table', { columns, rows, rowRef: 'open-deal', clickKey: 'id' })];
    const { text: out, interactives } = view(frame, { main: tree });

    const lines = out.split('\n');
    const header = lines.find((line) => line.includes('title'));
    const first = lines.find((line) => line.includes('Acme renewal'));
    expect(header).toBeDefined();
    expect(first).toContain('[1] Acme renewal');
    // the marker column keeps the grid aligned: 'title' starts where row text starts
    expect(header?.indexOf('title')).toBe(first?.indexOf('Acme'));
    expect(interactives).toHaveLength(2);
    expect(interactives[0]).toMatchObject({ kind: 'row', ref: 'open-deal', value: 'd1' });
    expect(interactives[1]).toMatchObject({ kind: 'row', ref: 'open-deal', value: 'd2' });
  });

  it('an empty table prints its empty text and registers nothing', () => {
    const { text: out, interactives } = view([component('Table', { columns, rows: [], rowRef: 'r', empty: 'No deals yet.' })]);
    expect(out).toContain('No deals yet.');
    expect(interactives).toHaveLength(0);
  });
});

describe('tty view — introspection primitives', () => {
  it('Panel prints a titled frame and registers backRef/closeRef', () => {
    const { text: out, interactives } = view([
      component('Panel', { title: 'Inspector', backRef: 'back', closeRef: 'close' }, [text('body')]),
    ]);
    expect(out).toContain('Inspector');
    expect(out).toContain('│ body');
    expect(interactives.map((i) => i.ref)).toEqual(['back', 'close']);
  });

  it('JsonTree prints an indented, capped tree', () => {
    const value = { user: { name: 'alex', roles: ['sales', 'dev'] } };
    const { text: out } = view([component('JsonTree', { value, label: 'state' })]);
    expect(out).toContain('state {1}');
    expect(out).toContain('name: "alex"');
    expect(out).toContain('roles [2]');
  });

  it('Badge wraps its children inline', () => {
    const { text: out } = view([component('Badge', {}, [text('live')])]);
    expect(out).toContain('‹live›');
  });
});
