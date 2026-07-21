import { PassThrough } from 'node:stream';
import { describe, it, expect, vi } from 'vitest';
import type { RenderNode } from '@niscorp/nova';
import { ttyTarget } from '../src/terminal/tty';
import type { TerminalApi } from '../src/terminal';

// ═══════════════════════════════════════════════════════════
// The TTY target — driven headlessly over PassThrough streams, the way the
// wire tests drive the protocol: a stub TerminalApi, commands written to the
// input, dispatches captured. The REPL contract in the open, no TTY needed.
// ═══════════════════════════════════════════════════════════

const component = (name: string, props: Record<string, unknown> = {}, children: RenderNode[] = []): RenderNode => ({
  type: 'component',
  name,
  props,
  children,
});
const text = (value: string): RenderNode => ({ type: 'text', value });

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const harness = (trees: Record<string, RenderNode[]>, options: { status?: () => 'connecting' | 'open' | 'closed' } = {}) => {
  const dispatched: { canvas: string; event: Record<string, unknown> }[] = [];
  const published: { channel: string; payload?: unknown }[] = [];
  const state = { trees };
  const api: TerminalApi = {
    frame: () => [component('CanvasSlot', { canvasId: 'main' }), component('CanvasSlot', { canvasId: 'aside' })],
    canvasTree: (id) => state.trees[id] ?? [],
    dispatch: (canvas, event) => void dispatched.push({ canvas, event: event as unknown as Record<string, unknown> }),
    publish: (channel, payload) => void published.push(payload === undefined ? { channel } : { channel, payload }),
  };
  const input = new PassThrough();
  const output = new PassThrough();
  let screen = '';
  output.on('data', (chunk: Buffer) => (screen += chunk.toString()));
  const quit = vi.fn();
  const mount = ttyTarget({ input, output, debounceMs: 0, onQuit: quit, ...options })(api);
  const type = async (line: string): Promise<void> => {
    input.write(`${line}\n`);
    await tick();
  };
  return { mount, api, state, dispatched, published, quit, type, input, screen: () => screen, reset: () => (screen = '') };
};

const button = (ref: string, label: string, value?: unknown): RenderNode => ({
  ...component('Button', value === undefined ? {} : { value }, [text(label)]),
  ref,
});

describe('the tty target — painting', () => {
  it('paints the initial frame with markers and canvas rules', () => {
    const h = harness({ main: [button('save', 'Save')] });
    expect(h.screen()).toContain('[moss/tty] terminal attached');
    expect(h.screen()).toContain('── main ');
    expect(h.screen()).toContain('[1] (Save)');
    expect(h.screen()).not.toContain('── aside'); // empty canvas collapses
    h.mount.destroy();
  });

  it('prints connection transitions once each — never the retry flap', () => {
    let status: 'connecting' | 'open' | 'closed' = 'connecting';
    const h = harness({ main: [] }, { status: () => status });
    expect(h.screen()).toContain('… connecting');
    status = 'closed'; // backoff flap while never connected — quiet
    h.mount.update();
    status = 'connecting';
    h.mount.update();
    expect(h.screen()).not.toContain('connection lost');
    status = 'open';
    h.mount.update();
    expect(h.screen()).toContain('✓ connected');
    status = 'closed';
    h.mount.update();
    expect(h.screen()).toContain('× connection lost — retrying');
    h.mount.destroy();
  });

  it('repaints on update when the tree changed, stays quiet when it did not', () => {
    const h = harness({ main: [text('one')] });
    h.reset();
    h.mount.update(); // same tree — no repaint
    expect(h.screen()).not.toContain('one');
    h.state.trees = { main: [text('two')] };
    h.mount.update();
    expect(h.screen()).toContain('two');
    h.mount.destroy();
  });
});

describe('the tty target — commands', () => {
  it('click <n> (and a bare number) dispatch ui:click on the interactive’s canvas, with its value payload', async () => {
    const h = harness({ main: [button('save', 'Save', 42)] });
    await h.type('click 1');
    await h.type('1');
    expect(h.dispatched).toEqual([
      { canvas: 'main', event: { type: 'ui:click', ref: 'save', payload: 42 } },
      { canvas: 'main', event: { type: 'ui:click', ref: 'save', payload: 42 } },
    ]);
    h.mount.destroy();
  });

  it('set <n> <text> dispatches ui:model with the typed string', async () => {
    const input: RenderNode = { ...component('Input', { placeholder: 'user' }), model: { path: 'form.user', ref: 'in-user' } };
    const h = harness({ main: [input] });
    await h.type('set 1 alex smith');
    expect(h.dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:model', ref: 'in-user', payload: 'alex smith' } }]);
    h.mount.destroy();
  });

  it('toggle <n> negates the current boolean; key <n> sends ui:key', async () => {
    const checkbox: RenderNode = { ...component('Checkbox', { value: true }), model: { path: 't.done', ref: 'chk' } };
    const field: RenderNode = { ...component('Input', { value: 'x' }), model: { path: 'f.q', ref: 'q' } };
    const h = harness({ main: [checkbox, field] });
    await h.type('toggle 1');
    await h.type('key 2 Enter');
    expect(h.dispatched).toEqual([
      { canvas: 'main', event: { type: 'ui:model', ref: 'chk', payload: false } },
      { canvas: 'main', event: { type: 'ui:key', ref: 'q', key: 'Enter' } },
    ]);
    h.mount.destroy();
  });

  it('unknown indexes point at refs', async () => {
    const h = harness({ main: [button('save', 'Save')] });
    await h.type('click 9');
    expect(h.dispatched).toHaveLength(0);
    expect(h.screen()).toContain('no [9] on screen');
    h.mount.destroy();
  });

  it('refs lists kind, ref, canvas, and model path', async () => {
    const input: RenderNode = { ...component('Input', { value: 'a' }), model: { path: 'form.user', ref: 'in-user' } };
    const h = harness({ main: [button('save', 'Save'), input] });
    await h.type('refs');
    expect(h.screen()).toContain('[1] click  save @main');
    expect(h.screen()).toContain('[2] model  in-user @main');
    expect(h.screen()).toContain('(form.user)');
    h.mount.destroy();
  });

  it('a bare number flips a toggle', async () => {
    const checkbox: RenderNode = { ...component('Checkbox', { value: true }), model: { path: 't.done', ref: 'chk' } };
    const h = harness({ main: [checkbox] });
    await h.type('1');
    expect(h.dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:model', ref: 'chk', payload: false } }]);
    h.mount.destroy();
  });

  it('publish parses JSON payloads and passes strings through; quit reports to the host', async () => {
    const h = harness({ main: [] });
    await h.type('publish refresh');
    await h.type('publish sel {"id":7}');
    await h.type('publish note plain words');
    expect(h.published).toEqual([{ channel: 'refresh' }, { channel: 'sel', payload: { id: 7 } }, { channel: 'note', payload: 'plain words' }]);
    await h.type('quit');
    expect(h.quit).toHaveBeenCalledOnce();
    h.mount.destroy();
  });
});

describe('the tty target — numbers act, words fill', () => {
  const input = (path: string, ref: string, value = ''): RenderNode => ({
    ...component('Input', { value }),
    model: { path, ref },
  });

  it('a bare number on an input focuses it: prompt shows the field, the next line is the value — verbatim', async () => {
    const h = harness({ main: [input('form.user', 'in-user', 'old')] });
    await h.type('1');
    expect(h.screen()).toContain('form.user ⟨old⟩');
    expect(h.dispatched).toHaveLength(0); // focusing dispatches nothing
    await h.type('help me plenty'); // even command words are data while focused
    expect(h.dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:model', ref: 'in-user', payload: 'help me plenty' } }]);
    h.mount.destroy();
  });

  it('an empty line cancels focus without dispatching; a bare `set <n>` also focuses', async () => {
    const h = harness({ main: [input('f.q', 'q', 'x')] });
    await h.type('1');
    await h.type(''); // cancel
    await h.type('set 1'); // focus again, never sends ''
    expect(h.dispatched).toHaveLength(0);
    await h.type('42'); // focused: digits are data, not a tap
    expect(h.dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:model', ref: 'q', payload: '42' } }]);
    h.mount.destroy();
  });

  it('bare words fill the only input on screen', async () => {
    const h = harness({ main: [button('send', 'Send magic link'), input('form.user', 'in-user')] });
    await h.type('alex smith');
    expect(h.dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:model', ref: 'in-user', payload: 'alex smith' } }]);
    h.mount.destroy();
  });

  it('bare words with several inputs ask to pick one instead of guessing', async () => {
    const h = harness({ main: [input('a.x', 'x'), input('a.y', 'y')] });
    await h.type('ambiguous');
    expect(h.dispatched).toHaveLength(0);
    expect(h.screen()).toContain('several inputs on screen');
    h.mount.destroy();
  });

  it('focus survives a repaint by identity and drops with a note when the input leaves', async () => {
    const h = harness({ main: [input('form.user', 'in-user', 'old')] });
    await h.type('1');
    h.state.trees = { main: [input('form.user', 'in-user', 'echoed')] };
    h.mount.update(); // server echo: same identity, new value — focus holds
    expect(h.screen()).toContain('form.user ⟨echoed⟩');
    h.state.trees = { main: [button('save', 'Save')] };
    h.mount.update(); // the input is gone — focus drops, loudly
    expect(h.screen()).toContain('input form.user left the screen');
    await h.type('stranded words'); // no longer focused, no input to fill
    expect(h.dispatched).toHaveLength(0);
    h.mount.destroy();
  });
});
