import type { ShellSnapshot } from '@niscorp/moss';
import { renderSnapshot } from '@niscorp/moss/terminal/react/server';
import { buildRegistry } from '../ui/registry';

// HOW A SCREEN IS DRAWN on the server: the kit the browser draws with, handed
// to moss. A page request is answered with the screen the socket would have
// streamed a moment later, and the browser's terminal adopts it (src/main.tsx).
const registry = buildRegistry();

export const drawing = {
  draw: (snapshot: ShellSnapshot): string => renderSnapshot({ snapshot, registry }),
};
