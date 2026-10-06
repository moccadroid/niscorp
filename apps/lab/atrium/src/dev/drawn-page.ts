// A SERVER-DRAWN PAGE, OPENED — shared by the checks that are about one
// (ssr-check, pages-check). The page is parsed the way a browser parses it and
// the app's own entry wiring is run against it: the real wire and the real React
// target, as src/main.tsx sets them up. The one thing that is not real is the
// socket, which never opens — the moment these checks are about is the one in
// which the page is up and the wire is not.
import { JSDOM } from 'jsdom';
import type { RenderNode } from '@niscorp/nova';

export const TEMPLATE = '<!doctype html><html lang="en"><head><title>Atrium</title></head><body><div id="root"></div></body></html>';

export type OpenedPage = {
  // what React said while adopting the page's elements
  complaints: string[];
  // whether the page's elements stand as the server wrote them
  unchanged: boolean;
  // every socket the wire asked for (none, for a page that needs none)
  sockets: string[];
  // everything the wire put on a socket
  sent: string[];
  status: () => string;
  press: () => void;
};

export const openPage = async (html: string, token: string | null): Promise<OpenedPage> => {
  const dom = new JSDOM(html, { url: 'http://localhost/' });
  const stored = new Map<string, string>(token === null ? [] : [['nisc.token', token]]);
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    navigator: dom.window.navigator,
    getComputedStyle: dom.window.getComputedStyle,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });

  const { act } = await import('react');
  const { createWire, readDocumentSnapshot } = await import('@niscorp/moss/client');
  const { createTerminal } = await import('@niscorp/moss/terminal');
  const { reactTarget } = await import('@niscorp/moss/terminal/react');
  const { buildRegistry } = await import('@atrium/ui/registry');
  const { atriumSlotWrapper } = await import('@atrium/ui/slot-wrapper');

  const root = dom.window.document.getElementById('root');
  if (root === null) throw new Error('drawn-page: the page has no root');
  const before = root.innerHTML;
  const complaints: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => void complaints.push(args.map(String).join(' ').replace(/\s+/g, ' ').slice(0, 240));

  const sockets: string[] = [];
  const sent: string[] = [];
  const drawn = readDocumentSnapshot(dom.window.document);
  const wire = createWire({
    ...(drawn !== undefined ? { initial: drawn } : {}),
    env: {
      tokens: { load: () => stored.get('nisc.token') ?? null, save: (next) => void stored.set('nisc.token', next), clear: () => void stored.delete('nisc.token') },
      // A socket that is CONNECTING and stays there.
      socket: ({ url }) => {
        sockets.push(url);
        const never: Pick<WebSocket, 'send' | 'close' | 'onopen' | 'onmessage' | 'onclose'> = { send: (text) => void sent.push(String(text)), close: () => undefined, onopen: null, onmessage: null, onclose: null };
        return never as WebSocket;
      },
      defaultUrl: () => 'ws://localhost/socket',
    },
  });
  await act(async () => {
    createTerminal({ target: reactTarget({ root, registry: buildRegistry(), slotWrapper: atriumSlotWrapper }), wire });
  });
  console.error = realError;
  return { complaints, unchanged: root.innerHTML === before, sockets, sent, status: () => wire.status(), press: () => wire.dispatch('main', { type: 'ui:click', ref: 'anything' }) };
};

export type CarriedSnapshot = { frame: RenderNode[]; trees: Record<string, RenderNode[]>; seed?: string; principal: boolean; live?: boolean; path?: string };

// The snapshot a drawn page carries, read back out of its markup.
export const snapshotIn = (html: string): CarriedSnapshot => {
  const text = /<script type="application\/json" id="nisc-snapshot">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (text === undefined) throw new Error('drawn-page: the page carries no snapshot');
  const parsed: CarriedSnapshot = JSON.parse(text);
  return parsed;
};
