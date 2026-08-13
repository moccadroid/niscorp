import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { NovaRenderProvider, RenderTree } from '../../src/adapters/react';
import { defaultRegistry, fallback, TextWrap, ErrorMarker, CanvasMarkersContext } from '../../src/adapters/ink';
import type { RenderComponentNode, RenderNode } from '../../src/layout/types';

// ═══════════════════════════════════════════════════════════
// The Ink kit — rendered through the React adapter's walker (the same
// provider the browser uses) into ink-testing-library's fake TTY: frames
// asserted as text, focus driven with Tab, activation with Enter.
// ═══════════════════════════════════════════════════════════

// RenderComponentNode, not the RenderNode union: `ref` and `model` live on the
// component member alone, so a helper typed as the union produces values that
// cannot carry either one once spread.
const component = (name: string, props: Record<string, unknown> = {}, children: RenderNode[] = []): RenderComponentNode => ({
  type: 'component',
  name,
  props,
  children,
});
const text = (value: string): RenderNode => ({ type: 'text', value });

const tick = (ms = 60): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
// Focus commits are async React state under parallel-suite load — give the
// '\t' a generous beat, and poll for outcomes instead of guessing latencies.
const focusTick = (): Promise<void> => tick(600);
const until = async (pred: () => boolean, ms = 2500): Promise<void> => {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < ms) await tick(20);
};
// Activate whatever Tab focused: an Enter before focus commits reaches no
// handler (harmless), so retry until the dispatch lands — load-proof.
const enterUntil = async (view: { stdin: { write: (s: string) => void } }, fired: () => boolean): Promise<void> => {
  for (let i = 0; i < 40 && !fired(); i += 1) {
    view.stdin.write('\r');
    await tick(60);
  }
};

const mount = (nodes: RenderNode[]) => {
  const dispatch = vi.fn();
  const view = render(
    <NovaRenderProvider registry={defaultRegistry()} fallback={fallback} textWrapper={TextWrap} errorMarker={ErrorMarker} dispatch={dispatch}>
      <RenderTree nodes={nodes} />
    </NovaRenderProvider>,
  );
  return { ...view, dispatch };
};

describe('ink kit — rendering', () => {
  it('renders the vocabulary as a screen: stack, text, button, input, badge', async () => {
    const view = mount([
      component('Stack', {}, [
        component('Text', { weight: 680 }, [text('Sign in to Relay')]),
        { ...component('Input', { placeholder: 'alex, jordan or sam' }), model: { path: 'form.user', ref: 'username' } },
        { ...component('Button', {}, [text('Send magic link')]), ref: 'send' },
        component('Badge', {}, [text('live')]),
      ]),
    ]);
    await tick();
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('Sign in to Relay');
    expect(frame).toContain('⟨');
    expect(frame).toContain('alex, jordan or sam'); // placeholder shows
    expect(frame).toContain('( Send magic link )');
    expect(frame).toContain(' live'); // ink trims the line-end space of the badge
    view.unmount();
  });

  it('unknown component names degrade through the fallback; served text and error nodes render ink-safe', async () => {
    const view = mount([
      component('KanbanBoard', {}, [text('card A')]), // bare text under a Box — needs the textWrapper
      component('NavItem', { label: 'Deals', count: 4 }),
      { type: 'error', code: 'E_BOOM', message: 'it broke' },
    ]);
    await tick();
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('card A');
    expect(frame).toContain('Deals (4)');
    expect(frame).toContain('[E_BOOM] it broke');
    expect(frame).not.toContain('COMPONENT_NOT_FOUND');
    view.unmount();
  });

  it('Grid honors weights: label/control rows align into columns across rows', async () => {
    const row = (label: string, control: RenderNode): RenderNode =>
      component('Grid', { weights: [3, 1] }, [component('Text', {}, [text(label)]), control]);
    const view = mount([
      component('Stack', {}, [
        row('Email notifications', { ...component('Checkbox', { value: true }), model: { path: 'a', ref: 'a' } }),
        row('Weekly digest', { ...component('Checkbox', { value: false }), model: { path: 'b', ref: 'b' } }),
      ]),
    ]);
    await tick();
    const lines = (view.lastFrame() ?? '').split('\n').filter((line) => line.includes('☑') || line.includes('☐'));
    expect(lines).toHaveLength(2);
    // the control column starts at the same cell on every row
    expect(lines[0]?.indexOf('☑')).toBe(lines[1]?.indexOf('☐'));
    view.unmount();
  });

  it('renders the table with aligned columns and an empty text', async () => {
    const columns = [
      { label: 'title', cell: { key: 'title' } },
      { label: 'stage', cell: { key: 'stage' } },
    ];
    const rows = [{ id: 'd1', title: 'Acme renewal', stage: 'won' }];
    const view = mount([component('Table', { columns, rows, rowRef: 'open', clickKey: 'id' })]);
    await tick();
    const frame = view.lastFrame() ?? '';
    const headerLine = frame.split('\n').find((line) => line.includes('title'));
    const rowLine = frame.split('\n').find((line) => line.includes('Acme renewal'));
    expect(headerLine?.indexOf('title')).toBe(rowLine?.indexOf('Acme'));

    const empty = mount([component('Table', { columns, rows: [], empty: 'No deals yet.' })]);
    await tick();
    expect(empty.lastFrame() ?? '').toContain('No deals yet.');
    view.unmount();
    empty.unmount();
  });
});

describe('ink kit — focus and activation', () => {
  it('Tab focuses the button, Enter dispatches ui:click with the value payload', async () => {
    const view = mount([{ ...component('Button', { value: 42 }, [text('Save')]), ref: 'save' }]);
    await until(() => (view.lastFrame() ?? '').includes('( Save )'));
    view.stdin.write('\t');
    await enterUntil(view, () => view.dispatch.mock.calls.length > 0);
    expect(view.dispatch).toHaveBeenCalledWith({ type: 'ui:click', ref: 'save', payload: 42 });
    view.unmount();
  });

  it('typing into a focused Input dispatches ui:model per keystroke; Enter adds ui:key', async () => {
    const view = mount([{ ...component('Input', {}), model: { path: 'form.user', ref: 'username' } }]);
    await until(() => (view.lastFrame() ?? '').includes('⟨'));
    view.stdin.write('\t'); // focus the input
    await focusTick();
    view.stdin.write('a');
    await until(() => view.dispatch.mock.calls.length >= 1);
    view.stdin.write('b');
    await until(() => view.dispatch.mock.calls.length >= 2);
    view.stdin.write('\r'); // submit
    await until(() => view.dispatch.mock.calls.length >= 3);
    const events = view.dispatch.mock.calls.map(([event]) => event as Record<string, unknown>);
    expect(events).toContainEqual({ type: 'ui:model', ref: 'username', payload: 'a' });
    expect(events).toContainEqual({ type: 'ui:model', ref: 'username', payload: 'ab' });
    expect(events[events.length - 1]).toEqual({ type: 'ui:key', ref: 'username', key: 'Enter' });
    view.unmount();
  });

  it('a focused Checkbox flips on Enter; a focused table row clicks its rowRef', async () => {
    const view = mount([{ ...component('Checkbox', { value: true }), model: { path: 't.done', ref: 'chk' } }]);
    await until(() => (view.lastFrame() ?? '').includes('☑'));
    view.stdin.write('\t');
    await enterUntil(view, () => view.dispatch.mock.calls.length > 0);
    expect(view.dispatch).toHaveBeenCalledWith({ type: 'ui:model', ref: 'chk', payload: false });
    view.unmount();

    const columns = [{ label: 'title', cell: { key: 'title' } }];
    const rows = [{ id: 'd1', title: 'Acme renewal' }];
    const table = mount([component('Table', { columns, rows, rowRef: 'open-deal', clickKey: 'id' })]);
    await until(() => (table.lastFrame() ?? '').includes('Acme renewal'));
    table.stdin.write('\t');
    await enterUntil(table, () => table.dispatch.mock.calls.length > 0);
    expect(table.dispatch).toHaveBeenCalledWith({ type: 'ui:click', ref: 'open-deal', payload: 'd1' });
    table.unmount();
  });
});

describe('ink kit — numbered markers', () => {
  it('markers display when a resolver is provided — buttons, inputs, and fallback rows carry [n]', async () => {
    const numbers: Record<string, number> = { username: 1, send: 2, 'nav-deals': 3 };
    const view = render(
      <NovaRenderProvider registry={defaultRegistry()} fallback={fallback} textWrapper={TextWrap} errorMarker={ErrorMarker} dispatch={vi.fn()}>
        <CanvasMarkersContext.Provider value={(ref) => numbers[ref]}>
          <RenderTree
            nodes={[
              { ...component('Input', {}), model: { path: 'form.user', ref: 'username' } },
              { ...component('Button', {}, [text('Send')]), ref: 'send' },
              { ...component('NavItem', { label: 'Deals', count: 4 }), ref: 'nav-deals' },
            ]}
          />
        </CanvasMarkersContext.Provider>
      </NovaRenderProvider>,
    );
    await tick();
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('[1] ⟨');
    expect(frame).toContain('[2] ( Send )');
    expect(frame).toContain('[3] Deals (4)');
    view.unmount();
  });

  it('without a resolver no markers show — a bare kit render stays clean', async () => {
    const view = mount([{ ...component('Button', {}, [text('Save')]), ref: 'save' }]);
    await tick();
    expect(view.lastFrame() ?? '').toContain('( Save )');
    expect(view.lastFrame() ?? '').not.toContain('[');
    view.unmount();
  });
});
