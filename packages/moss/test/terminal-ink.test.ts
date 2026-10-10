import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { Text } from 'ink';
import type { NovaEvent, RenderComponentNode, RenderNode } from '@niscorp/nova';
import { inkTarget } from '../src/terminal/ink';
import type { InkTargetConfig } from '../src/terminal/ink';
import type { TerminalApi, TerminalMount } from '../src/terminal';

// ═══════════════════════════════════════════════════════════
// The ink target — driven the way the tty tests drive theirs: a stub
// TerminalApi over mutable trees, keys written to a stand-in for the keyboard,
// dispatches captured, `update` called as the conductor would on a wire
// change. ink draws for real, into a stream that says it is a terminal.
// ═══════════════════════════════════════════════════════════

// ink writes a frame as it changes only where it believes somebody is
// watching, and a CI runner says nobody is: there it writes one frame, when it
// unmounts. Said before ink is loaded, which is when it asks.
vi.hoisted(() => {
  process.env['CI'] = 'false';
});

// RenderComponentNode, not the RenderNode union: `ref` and `model` live on the
// component member alone.
const component = (name: string, props: Record<string, unknown> = {}, children: RenderNode[] = []): RenderComponentNode => ({
  type: 'component',
  name,
  props,
  children,
});
const text = (value: string): RenderNode => ({ type: 'text', value });
const button = (ref: string, label: string, value?: unknown): RenderNode => ({
  ...component('Button', value === undefined ? {} : { value }, [text(label)]),
  ref,
});
const input = (path: string, ref: string, value = ''): RenderNode => ({ ...component('Input', { value }), model: { path, ref } });
const checkbox = (path: string, ref: string, value: boolean): RenderNode => ({ ...component('Checkbox', { value }), model: { path, ref } });

// A served ActionSlot marker as flattenRenderTree stamps it: identity in
// props, keyed by instance, the instance's tree as children.
const instance = (instanceId: string, canvasId: string, children: RenderNode[]): RenderNode => ({
  ...component('ActionSlot', { instanceId, canvasId, definitionId: 'counter' }, children),
  key: instanceId,
});

const FRAME: RenderNode[] = [component('CanvasSlot', { canvasId: 'main' }), component('CanvasSlot', { canvasId: 'aside' })];

const until = (pred: () => boolean, why: string, ms = 5_000): Promise<void> =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = (): void => {
      if (pred()) return resolve();
      if (Date.now() - started > ms) return reject(new Error(`timed out: ${why}`));
      setTimeout(tick, 5);
    };
    tick();
  });

// A keyboard and a screen that say they are a terminal: ink asks `isTTY`
// before it reads keys one at a time, and reads them with 'readable' + read().
// ink's own types ask for Node's tty streams, which nothing but a real
// terminal can make; these two casts are the whole of the pretending.
const keyboard = (): { stream: NodeJS.ReadStream; press: (keys: string) => void } => {
  const stream = new PassThrough();
  const tty = Object.assign(stream, { isTTY: true, setRawMode: () => tty, ref: () => tty, unref: () => tty });
  return { stream: tty as unknown as NodeJS.ReadStream, press: (keys) => void stream.write(keys) };
};
const display = (): { stream: NodeJS.WriteStream; shown: () => string; wipe: () => void } => {
  const stream = Object.assign(new PassThrough(), { isTTY: true, columns: 100, rows: 40 });
  let shown = '';
  stream.on('data', (chunk: Buffer) => (shown += chunk.toString()));
  return { stream: stream as unknown as NodeJS.WriteStream, shown: () => shown, wipe: () => (shown = '') };
};

const mounts: TerminalMount[] = [];
afterEach(() => {
  for (const mount of mounts.splice(0)) mount.destroy();
});

const harness = (trees: Record<string, RenderNode[]>, options: { frame?: RenderNode[]; status?: TerminalApi['status'] } & Pick<InkTargetConfig, 'slotWrapper'> = {}) => {
  const dispatched: { canvas: string; event: NovaEvent }[] = [];
  const published: { channel: string; payload?: unknown }[] = [];
  const { frame = FRAME, status = () => 'open', ...config } = options;
  const state = { trees };
  const api: TerminalApi = {
    frame: () => frame,
    canvasTree: (id) => state.trees[id] ?? [],
    dispatch: (canvas, event) => void dispatched.push({ canvas, event }),
    publish: (channel, payload) => void published.push(payload === undefined ? { channel } : { channel, payload }),
    status,
  };
  const keys = keyboard();
  const screen = display();
  const quit = vi.fn();
  // patchConsole off: the console is this process's, and the test runner's.
  const mount = inkTarget({ stdin: keys.stream, stdout: screen.stream, onQuit: quit, patchConsole: false, ...config })(api);
  mounts.push(mount);
  const shows = (words: string): Promise<void> => until(() => screen.shown().includes(words), `the screen shows "${words}"`);
  // A key is read by whoever is listening when it arrives, and ink's
  // components start listening once they are on screen.
  const press = async (key: string): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    keys.press(key);
  };
  const sent = (count: number): Promise<void> => until(() => dispatched.length >= count, `${count} event${count === 1 ? '' : 's'} dispatched`);
  return { mount, state, dispatched, published, quit, press, sent, shows, shown: screen.shown, wipe: screen.wipe };
};

describe('the ink target — painting', () => {
  it('paints a canvas’s tree with a [n] marker on what can be acted on, and nothing for an empty canvas', async () => {
    const t = harness({ main: [component('Text', {}, [text('Rooms')]), button('save', 'Save')] });
    await t.shows('Rooms');
    await t.shows('[1]');
    expect(t.shown()).toContain('( Save )');
  });

  it('numbers what is on screen in the order it is drawn, across canvases', async () => {
    const t = harness({ main: [button('save', 'Save')], aside: [button('help', 'Help')] });
    await t.shows('( Help )');
    expect(t.shown()).toMatch(/\[1\][^[]*\( Save \)/);
    expect(t.shown()).toMatch(/\[2\][^[]*\( Help \)/);
  });

  it('repaints on update with the tree as it is now', async () => {
    const t = harness({ main: [component('Text', {}, [text('one')])] });
    await t.shows('one');
    t.state.trees = { main: [component('Text', {}, [text('two')])] };
    t.mount.update();
    await t.shows('two');
  });

  it('a node the kit has no component for is drawn by the fallback, not as an error', async () => {
    const t = harness({ main: [component('Marquee', {}, [component('Text', {}, [text('inside')])])] });
    await t.shows('inside');
    expect(t.shown()).not.toContain('UNKNOWN_COMPONENT');
  });

  it('says the connection is not open, and stops saying it once it is', async () => {
    let status: 'connecting' | 'open' | 'closed' | 'incompatible' = 'connecting';
    const t = harness({ main: [component('Text', {}, [text('Rooms')])] }, { status: () => status });
    await t.shows('… connecting');
    status = 'closed';
    t.mount.update();
    await t.shows('× connection lost — retrying');
    status = 'incompatible';
    t.mount.update();
    await t.shows('speak different protocol versions');
    status = 'open';
    t.wipe();
    t.mount.update();
    await t.shows('Rooms');
    expect(t.shown()).not.toMatch(/connecting|connection lost|protocol versions/);
  });

  it('wraps each instance in the app’s slotWrapper, handed identity', async () => {
    const t = harness(
      { main: [instance('i1', 'main', [component('Text', {}, [text('body')])])] },
      { slotWrapper: ({ instanceId, canvasId, definitionId, children }) => createElement(Text, null, `${definitionId}/${instanceId}@${canvasId}:`, children) },
    );
    await t.shows('counter/i1@main:');
    expect(t.shown()).toContain('body');
  });
});

describe('the ink target — typed numbers', () => {
  it('a number on a button dispatches ui:click on its canvas, with its value payload', async () => {
    const t = harness({ main: [button('save', 'Save', 42)] });
    await t.shows('[1]');
    await t.press('1');
    await t.sent(1);
    expect(t.dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:click', ref: 'save', payload: 42 } }]);
  });

  it('inside an action instance, the instance is the event’s origin', async () => {
    const t = harness({ main: [instance('i1', 'main', [button('inc', 'inc')]), instance('i2', 'main', [button('inc', 'inc')])] });
    await t.shows('[2]');
    await t.press('2');
    await t.sent(1);
    expect(t.dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:click', ref: 'inc', origin: 'i2' } }]);
  });

  it('a number on a toggle flips it', async () => {
    const t = harness({ main: [checkbox('t.done', 'chk', true)] });
    await t.shows('[1]');
    await t.press('1');
    await t.sent(1);
    expect(t.dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:model', ref: 'chk', payload: false } }]);
  });

  it('a number on an input focuses it and dispatches nothing; what is typed next is its value, digits included', async () => {
    const t = harness({ main: [button('send', 'Send'), input('form.user', 'in-user')] });
    await t.shows('[2]');
    await t.press('2');
    await t.press('a1');
    await t.sent(1);
    expect(t.dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:model', ref: 'in-user', payload: 'a1' } }]);
    // Enter in the field is the field's key, sent up as every other target sends it
    await t.press('\r');
    await t.sent(2);
    expect(t.dispatched.at(-1)).toEqual({ canvas: 'main', event: { type: 'ui:key', ref: 'in-user', key: 'Enter' } });
  });

  it('a number that names frame chrome dispatches nothing', async () => {
    const t = harness({ main: [button('save', 'Save')] }, { frame: [button('menu', 'Menu'), ...FRAME] });
    await t.shows('( Save )');
    await t.press('1'); // the frame's own button
    await t.press('2');
    await t.sent(1);
    expect(t.dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:click', ref: 'save' } }]);
  });

  it('two digits name [12] at once; one digit that could be the start of a longer number waits a beat', async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => button(`b${i + 1}`, `B${i + 1}`));
    const t = harness({ main: twelve });
    await t.shows('[12]');
    await t.press('1');
    await t.press('2');
    await t.sent(1);
    expect(t.dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:click', ref: 'b12' } }]);
    await t.press('1');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(t.dispatched).toHaveLength(1); // still waiting for a second digit
    await t.sent(2);
    expect(t.dispatched.at(-1)).toEqual({ canvas: 'main', event: { type: 'ui:click', ref: 'b1' } });
  });

  it('a number nothing on screen carries dispatches nothing', async () => {
    const t = harness({ main: [button('save', 'Save')] });
    await t.shows('[1]');
    await t.press('7');
    await t.press('1');
    await t.sent(1);
    expect(t.dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:click', ref: 'save' } }]);
  });
});

describe('the ink target — the focus ring and leaving', () => {
  it('Tab then Enter activates the focused button, through the canvas it is on', async () => {
    const t = harness({ main: [instance('i1', 'main', [button('save', 'Save', 'draft')])] });
    await t.shows('[1]');
    await t.press('\t');
    await t.press('\r');
    await t.sent(1);
    expect(t.dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:click', ref: 'save', payload: 'draft', origin: 'i1' } }]);
  });

  it('Ctrl+C reports to the host, which owns the wire and the process', async () => {
    const t = harness({ main: [button('save', 'Save')] });
    await t.shows('[1]');
    await t.press('\u0003');
    await until(() => t.quit.mock.calls.length === 1, 'the host is told');
  });

  it('destroy takes the screen down: a later update paints nothing', async () => {
    const t = harness({ main: [component('Text', {}, [text('one')])] });
    await t.shows('one');
    t.mount.destroy();
    mounts.splice(0);
    t.wipe();
    t.state.trees = { main: [component('Text', {}, [text('two')])] };
    t.mount.update();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(t.shown()).not.toContain('two');
  });
});
