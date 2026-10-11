import type { RenderNode } from '@niscorp/nova';
import type { TerminalApi } from './index';

// ═══════════════════════════════════════════════════════════════
// A screen drawn ahead of its terminal. A server draws a shell's snapshot to a
// string with one of the targets' `./server` entries, and the browser's target
// then stands on what it wrote. Both halves of that are the same for every
// target, and are said here once.
// ═══════════════════════════════════════════════════════════════

// The frame and every canvas's tree — moss's `shells.snapshot`, which also
// says whether anything on the screen can still happen (`live`).
export type DrawnSnapshot = { frame: RenderNode[]; trees: Record<string, RenderNode[]>; live?: boolean };

const nothing = (): void => undefined;

// A snapshot, as what a target renders.
export const drawnApi = (snapshot: DrawnSnapshot): TerminalApi => ({
  frame: () => snapshot.frame,
  canvasTree: (canvasId) => snapshot.trees[canvasId] ?? [],
  // a string has nobody to press it
  dispatch: nothing,
  publish: nothing,
  // The status the page's terminal starts in, so a kit that draws the status
  // draws the same thing on both sides: no socket is opened for a page with
  // nothing left to happen (the wire's `static`), and every other page's is
  // still connecting when its target first draws.
  status: () => (snapshot.live === false ? 'static' : 'connecting'),
});

// A root that already holds elements was drawn on the server from the snapshot
// the wire starts from: a target that can adopt elements adopts those instead
// of replacing them. Only when there is a frame to adopt them WITH: a wire
// that did not start from the page's snapshot (it was drawn for somebody else)
// has nothing that matches, and the elements are replaced as on any other
// page. An empty root is a client-rendered page.
export const holdsDrawnScreen = (root: HTMLElement, api: TerminalApi): boolean => root.firstElementChild !== null && api.frame().length > 0;
