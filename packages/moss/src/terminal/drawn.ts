import type { RenderNode } from '@niscorp/nova';
import type { TerminalApi } from './index';

export type DrawnSnapshot = { frame: RenderNode[]; trees: Record<string, RenderNode[]>; live?: boolean };

const nothing = (): void => undefined;

export const drawnApi = (snapshot: DrawnSnapshot): TerminalApi => ({
  frame: () => snapshot.frame,
  canvasTree: (canvasId) => snapshot.trees[canvasId] ?? [],
  dispatch: nothing,
  publish: nothing,
  // The status the page's wire starts in, so a kit that draws it draws the same on both sides.
  status: () => (snapshot.live === false ? 'static' : 'connecting'),
});

// Adopted only with a frame to match: a wire that did not start from the page's snapshot has
// none, and the elements are replaced.
export const holdsDrawnScreen = (root: HTMLElement, api: TerminalApi): boolean => root.firstElementChild !== null && api.frame().length > 0;
