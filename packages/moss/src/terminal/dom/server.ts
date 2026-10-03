import { renderToString } from '@niscorp/nova/adapters/dom/server';
import type { DomComponent } from '@niscorp/nova/adapters/dom';
import { defaultRegistry, fallback } from '@niscorp/nova/adapters/dom/components';
import type { ComponentRegistry, RenderNode } from '@niscorp/nova';

// ═══════════════════════════════════════════════════════════
// @niscorp/moss/terminal/dom/server — the plain-DOM target, drawing a served
// snapshot to a string. The drawing is nova's (`adapters/dom/server`): a DOM kit
// builds real elements, so the host hands in a DOM to build them in (`window`:
// jsdom, happy-dom, linkedom — neither package depends on one), and its names
// are lent to the global scope for the length of one synchronous draw.
//
// The browser's target (./index) needs no twin of React's adoption: the first
// render of nova's DOM adapter replaces the server's elements with the same
// elements in one step. (Only the first: after it, the adapter keeps what did
// not change.)
// ═══════════════════════════════════════════════════════════

export type RenderSnapshotConfig = {
  snapshot: { frame: RenderNode[]; trees: Record<string, RenderNode[]> };
  // the app's DOM kit; omitted, nova's reference kit
  registry?: ComponentRegistry<DomComponent>;
  // a DOM to draw in
  window: object;
};

const nothing = (): void => undefined;

export const renderSnapshot = (config: RenderSnapshotConfig): string =>
  renderToString(
    config.registry ?? defaultRegistry(),
    { frame: () => config.snapshot.frame, canvasTree: (id) => config.snapshot.trees[id] ?? [], dispatch: nothing, publish: nothing },
    { window: config.window, fallback },
  );
