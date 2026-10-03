import { JSDOM } from 'jsdom';
import type { ShellSnapshot } from '@niscorp/moss';
import { renderSnapshot } from '@niscorp/moss/terminal/dom/server';
import { buildRegistry } from '../ui/registry';

// HOW A SCREEN IS DRAWN on the server: the kit the browser draws with, handed
// to moss. A DOM kit builds real elements, so it is handed a DOM to build them
// in (jsdom). A page request is answered with the screen the socket would have
// streamed a moment later.
const registry = buildRegistry();
const { window } = new JSDOM('');

export const drawing = {
  draw: (snapshot: ShellSnapshot): string => renderSnapshot({ snapshot, registry, window }),
};
