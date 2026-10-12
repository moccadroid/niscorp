import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { Text } from 'ink';
import { defaultRegistry } from '@niscorp/nova/adapters/ink';
import type { NovaEvent, RenderComponentNode, RenderNode } from '@niscorp/nova';
import { inkTarget } from '../src/terminal/ink';
import type { InkTargetConfig } from '../src/terminal/ink';
import type { TerminalApi, TerminalMount } from '../src/terminal';

// ink writes a frame as it changes only where it believes somebody is watching, and a CI
// runner says nobody is. It asks when it is loaded, so this runs first. Colour is forced
// because the kit draws focus in inverse, which colour off does not have.
vi.hoisted(() => {
  process.env['CI'] = 'false';
  process.env['FORCE_COLOR'] = '1';
});

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

const keyboard = (): { stream: NodeJS.ReadStream; press: (keys: string) => void; unread: () => boolean } => {
  const stream = new PassThrough();
  const tty = Object.assign(stream, { isTTY: true, setRawMode: () => tty, ref: () => tty, unref: () => tty });
  return { stream: tty as unknown as NodeJS.ReadStream, press: (keys) => void stream.write(keys), unread: () => stream.readableLength > 0 };
};
const STYLE = /\u001b\[[0-9;]*m/g;
const INVERSE = '\u001b[7m';
const display = (): { stream: NodeJS.WriteStream; shown: () => string; written: () => string; wipe: () => void } => {
  const stream = Object.assign(new PassThrough(), { isTTY: true, columns: 100, rows: 40 });
  let written = '';
  stream.on('data', (chunk: Buffer) => (written += chunk.toString()));
  return { stream: stream as unknown as NodeJS.WriteStream, shown: () => written.replace(STYLE, ''), written: () => written, wipe: () => (written = '') };
};

const mounts: TerminalMount[] = [];
afterEach(() => {
  for (const mount of mounts.splice(0)) mount.destroy();
});

const harness = (trees: Record<string, RenderNode[]>, options: { frame?: RenderNode[]; status?: TerminalApi['status'] } & Pick<InkTargetConfig, 'slotWrapper' | 'registry'> = {}) => {
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
  // Waits until ink has read the key: one written before the last was read would
  // arrive with it, as one read.
  const press = async (key: string): Promise<void> => {
    keys.press(key);
    await until(() => !keys.unread(), 'ink read the key');
  };
  const sent = (count: number): Promise<void> => until(() => dispatched.length >= count, `${count} event${count === 1 ? '' : 's'} dispatched`);
  // ink moves the focus on Tab in a turn of its own, and what is focused takes its keys one turn
  // after it is drawn: wait for the screen to show the focus, then for that turn.
  const focusOn = async (words: string): Promise<void> => {
    await until(() => screen.written().includes(`${INVERSE}${words}`), `the focus is on "${words}"`);
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { mount, state, dispatched, published, quit, press, sent, shows, focusOn, shown: screen.shown, wipe: screen.wipe };
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
    await t.press('\r');
    await t.sent(2);
    expect(t.dispatched.at(-1)).toEqual({ canvas: 'main', event: { type: 'ui:key', ref: 'in-user', key: 'Enter' } });
  });

  it('a number that names frame chrome dispatches nothing', async () => {
    const t = harness({ main: [button('save', 'Save')] }, { frame: [button('menu', 'Menu'), ...FRAME] });
    await t.shows('( Save )');
    await t.press('1');
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
    const pressed = Date.now();
    await t.press('1');
    await t.sent(2);
    expect(Date.now() - pressed).toBeGreaterThan(300);
    expect(t.dispatched.at(-1)).toEqual({ canvas: 'main', event: { type: 'ui:click', ref: 'b1' } });
  });

  it('digits that arrive together are the number they spell', async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => button(`b${i + 1}`, `B${i + 1}`));
    const t = harness({ main: twelve });
    await t.shows('[12]');
    await t.press('12');
    await t.sent(1);
    expect(t.dispatched).toEqual([{ canvas: 'main', event: { type: 'ui:click', ref: 'b12' } }]);
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
    await t.focusOn('( Save )');
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

  it('destroy is not reported to the host as a quit', async () => {
    const t = harness({ main: [button('save', 'Save')] });
    await t.shows('[1]');
    t.mount.destroy();
    mounts.splice(0);
    // Waits on the clock: ink tells its app it has ended on its own schedule after the unmount,
    // and nothing says when it is done. 150 ms is several of its frames.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(t.quit).not.toHaveBeenCalled();
  });

  it('a kit component that throws ends this terminal and tells the host, and rejects nothing into the process', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const registry = defaultRegistry();
    registry.register('Broken', () => {
      throw new Error('the kit broke');
    });
    const t = harness({ main: [component('Broken')] }, { registry });
    await t.shows('the kit broke');
    await until(() => t.quit.mock.calls.length + unhandled.mock.calls.length > 0, 'the terminal ended, one way or the other');
    // Waits on the clock: ink's rejection and the host's quit are not the same turn,
    // and 50 ms is for the second to arrive if it is going to.
    await new Promise((resolve) => setTimeout(resolve, 50));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(t.quit).toHaveBeenCalledOnce();
    expect(said.mock.calls.flat().map(String).join(' ')).toContain('the kit broke');
    said.mockRestore();
  });

  it('destroy takes the screen down: a later update paints nothing', async () => {
    const t = harness({ main: [component('Text', {}, [text('one')])] });
    await t.shows('one');
    t.mount.destroy();
    mounts.splice(0);
    t.wipe();
    t.state.trees = { main: [component('Text', {}, [text('two')])] };
    t.mount.update();
    // Waits on the clock: ink holds a frame back for about 30 ms, so an update that
    // was going to paint has painted well within 100.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(t.shown()).not.toContain('two');
  });
});
