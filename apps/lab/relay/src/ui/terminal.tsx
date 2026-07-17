import { createContext, useContext, useSyncExternalStore, type FC } from 'react';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/react';
import type { NovaEvent } from '@niscorp/nova';
import type { Wire } from '@niscorp/moss/client';
import { buildRegistry } from './registry';

// ═══════════════════════════════════════════════════════════
// TEMPORARY terminal — renders moss's wire (the served frame + per-canvas
// trees) with nova's react adapter. It lives in ui/ (relay's React home),
// NOT in the entry file. Where remote-shell rendering ULTIMATELY lives is
// an open decision (the generic apps/terminal product, pending); until
// then this is relay's own small, disposable renderer.
// ═══════════════════════════════════════════════════════════

const registry = buildRegistry();
const WireContext = createContext<Wire | undefined>(undefined);

// Resolves a served CanvasSlot marker to that canvas's live tree; events
// go back tagged with the canvas they came from (moss stamps the origin).
const CanvasSlot: FC<{ canvasId?: string }> = ({ canvasId }) => {
  const wire = useContext(WireContext);
  const snapshot = useSyncExternalStore(wire?.subscribe ?? (() => () => undefined), wire?.snapshot ?? (() => ({ frame: [], trees: new Map() })));
  if (wire === undefined || canvasId === undefined) return null;
  const tree = snapshot.trees.get(canvasId) ?? [];
  if (tree.length === 0) return null;
  return (
    <NovaRenderProvider
      registry={registry}
      dispatch={(event: NovaEvent) => wire.dispatch(canvasId, event)}
      publish={(channel, payload) => wire.publish(channel, payload)}
    >
      <RenderTree nodes={tree} />
    </NovaRenderProvider>
  );
};
registry.registerAll({ CanvasSlot: Object.assign(CanvasSlot, { meta: { description: 'A canvas, live from the server.' } }) });

// The terminal: render the served frame; its CanvasSlot markers resolve to
// the live canvas trees above.
export const Terminal: FC<{ wire: Wire }> = ({ wire }) => {
  const snapshot = useSyncExternalStore(wire.subscribe, wire.snapshot);
  return (
    <WireContext.Provider value={wire}>
      <NovaRenderProvider registry={registry} dispatch={() => undefined} publish={(channel, payload) => wire.publish(channel, payload)}>
        <RenderTree nodes={snapshot.frame} />
      </NovaRenderProvider>
    </WireContext.Provider>
  );
};
