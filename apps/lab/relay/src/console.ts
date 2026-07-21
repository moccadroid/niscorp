import { createWire, browserEnv } from '@niscorp/moss/client';
import { createTtyView } from '@niscorp/nova/adapters/tty';
import type { TtyFrame, TtyInteractive, TtyRenderApi } from '@niscorp/nova/adapters/tty';
import { defaultRegistry, fallback } from '@niscorp/nova/adapters/tty/components';

// ═══════════════════════════════════════════════════════════
// Relay in the F12 console — the smallest terminal: any webpage's devtools
// console becomes a render target. Paste the built bundle (dist/console.js,
// `pnpm console`) into a console, or on lax-CSP pages:
//
//   await fetch('http://localhost:8787/console.js').then(r => r.text()).then(eval)
//
// Frames log as styled monospace with the same [n] markers as every other
// terminal; the globals it installs are the whole input scheme:
//
//   act(6)          click [6] (button, row) · flip a toggle
//   act(3, 'alex')  type into input [3]
//   key(3, 'Enter') send a key to input [3]
//   refs()          console.table of everything actionable
//   show()          reprint the current screen
//   relayQuit()     disconnect and remove the globals
//
// The session token lives in the VISITED page's localStorage — a separate
// session per origin you haunt. RELAY_URL (set before pasting) overrides
// the default ws://127.0.0.1:8787/socket.
// ═══════════════════════════════════════════════════════════

type ConsoleGlobals = Record<string, unknown> & { __relayConsole?: { dispose: () => void } };
const w = window as unknown as ConsoleGlobals;

// re-paste = reconnect: tear the previous instance down first
w.__relayConsole?.dispose();

const url = typeof w['RELAY_URL'] === 'string' ? (w['RELAY_URL'] as string) : 'ws://127.0.0.1:8787/socket';
const wire = createWire({ url, env: browserEnv({ tokenKey: 'relay.console.token' }) });

const api: TtyRenderApi = {
  frame: () => wire.snapshot().frame,
  canvasTree: (id) => wire.snapshot().trees.get(id) ?? [],
  dispatch: (id, event) => wire.dispatch(id, event),
  publish: (channel, payload) => wire.publish(channel, payload),
};
const view = createTtyView(defaultRegistry(), api, { fallback });

const MONO = 'font-family:ui-monospace,monospace;white-space:pre';
const MARKER = `${MONO};color:#00bcd4;font-weight:bold`;

// One console.log per frame: %c-styled so markers read cyan, everything mono.
const styled = (text: string): [string, string[]] => {
  const styles: string[] = [MONO];
  const fmt = text.replace(/%/g, '%%').replace(/\[\d+\]/g, (marker) => {
    styles.push(MARKER, MONO);
    return `%c${marker}%c`;
  });
  return [`%c${fmt}`, styles];
};

let last: TtyFrame = { text: '', interactives: [] };
let timer: ReturnType<typeof setTimeout> | undefined;
let link: 'unknown' | 'up' | 'down' = 'unknown';

const paint = (force = false): void => {
  const frame = view.render();
  const changed = frame.text !== last.text;
  last = frame;
  if ((!changed && !force) || frame.text === '') return;
  const [fmt, styles] = styled(frame.text);
  console.log(fmt, ...styles);
};

const checkStatus = (): void => {
  const status = wire.status();
  if (status === 'open' && link !== 'up') {
    link = 'up';
    console.log('%c✓ connected', 'color:#4caf50');
  } else if (status !== 'open' && link === 'up') {
    link = 'down';
    console.log('%c× connection lost — retrying', 'color:#f44336');
  } else if (link === 'unknown') {
    link = 'down';
    console.log('%c… connecting', 'color:#ff9800');
  }
};

const update = (): void => {
  checkStatus();
  clearTimeout(timer);
  timer = setTimeout(paint, 80);
};
const unsubscribe = wire.subscribe(update);

const find = (index: number): TtyInteractive | undefined => last.interactives.find((item) => item.index === index);
const guard = (index: number): TtyInteractive | undefined => {
  const item = find(index);
  if (item === undefined) console.warn(`no [${index}] on screen — refs()`);
  else if (item.canvas === '') {
    console.warn(`[${index}] is frame chrome — it dispatches nothing`);
    return undefined;
  }
  return item;
};

const act = (index: number, value?: unknown): void => {
  const item = guard(index);
  if (item === undefined) return;
  if (item.kind === 'model') {
    if (value === undefined) console.warn(`[${index}] is an input — act(${index}, 'text')`);
    else api.dispatch(item.canvas, { type: 'ui:model', ref: item.ref, payload: String(value) });
    return;
  }
  if (item.kind === 'toggle') {
    api.dispatch(item.canvas, { type: 'ui:model', ref: item.ref, payload: value === undefined ? item.value !== true : value === true });
    return;
  }
  api.dispatch(item.canvas, item.value === undefined ? { type: 'ui:click', ref: item.ref } : { type: 'ui:click', ref: item.ref, payload: item.value });
};

const key = (index: number, name: string): void => {
  const item = guard(index);
  if (item === undefined) return;
  if (item.kind !== 'model') {
    console.warn(`[${index}] is not an input`);
    return;
  }
  api.dispatch(item.canvas, { type: 'ui:key', ref: item.ref, key: name });
};

const refs = (): void => {
  if (last.interactives.length === 0) {
    console.log('nothing actionable on screen');
    return;
  }
  console.table(
    last.interactives.map(({ index, kind, ref, canvas, label, path }) => ({
      '[n]': index, kind, ref, canvas: canvas === '' ? 'frame' : canvas, label, ...(path !== undefined ? { path } : {}),
    })),
  );
};

const dispose = (): void => {
  clearTimeout(timer);
  unsubscribe();
  wire.dispose();
  for (const name of ['act', 'key', 'refs', 'show', 'relayQuit']) delete w[name];
  delete w.__relayConsole;
  console.log('%c[relay/console] disconnected', 'color:#9e9e9e');
};

Object.assign(w, { act, key, refs, show: () => paint(true), relayQuit: dispose, __relayConsole: { dispose } });

console.log(
  `%c[relay/console] terminal attached — ${url}\nact(n) · act(n,'text') · key(n,'Enter') · refs() · show() · relayQuit()`,
  'color:#00bcd4;font-weight:bold',
);
checkStatus();
paint(true);
