import { createElement, type FC, type ReactNode } from 'react';
import { CanvasMarkersContext } from '@niscorp/nova/adapters/ink';
import type { MarkerResolve } from '@niscorp/nova/adapters/ink';
import { createTtyView } from '@niscorp/nova/adapters/tty';
import type { TtyInteractive } from '@niscorp/nova/adapters/tty';
import { defaultRegistry as ttyRegistry, fallback as ttyFallback } from '@niscorp/nova/adapters/tty/components';
import type { TerminalApi } from '../index';

// The marker table: the TTY adapter's walker run over the SAME served trees
// ink draws — one source of truth for the numbering, so `[7]` is the same
// thing in the REPL and the TUI. Pure and cheap; rebuilt at the top of every
// frame render.
//
// Identity for lookup is (canvas, instance, ref, occurrence). The instance
// keeps apart the live instances of a list canvas, which share refs (a tab
// bar: every tab's button is `open`); occurrence disambiguates a table's
// rows, which share one rowRef in row order.

export type Marks = {
  // rebuild from the trees as they are now
  reindex: () => void;
  // how many things on screen carry a number
  count: () => number;
  // what `[index]` names, if anything does
  at: (index: number) => TtyInteractive | undefined;
  // ink resolves markers per canvas and, inside an action instance, per
  // instance ('' outside one)
  resolverFor: (canvasId: string, instanceId: string) => MarkerResolve;
};

export const createMarks = (api: TerminalApi): Marks => {
  const indexView = createTtyView(ttyRegistry(), api, { fallback: ttyFallback });
  let list: TtyInteractive[] = [];
  const byKey = new Map<string, TtyInteractive>();
  return {
    reindex: () => {
      list = indexView.render().interactives;
      byKey.clear();
      const seen = new Map<string, number>();
      for (const item of list) {
        const base = `${item.canvas}:${item.origin ?? ''}:${item.ref}`;
        const occurrence = seen.get(base) ?? 0;
        seen.set(base, occurrence + 1);
        byKey.set(`${base}#${occurrence}`, item);
        // click-kinds carry a stable payload — a list's rows share one ref and
        // differ only by value, so value IS the identity there. Model-kinds'
        // value changes as you type; they stay occurrence-keyed.
        if ((item.kind === 'click' || item.kind === 'row') && item.value !== undefined) {
          byKey.set(`${base}@${JSON.stringify(item.value)}`, item);
        }
      }
    },
    count: () => list.length,
    at: (index) => list.find((entry) => entry.index === index),
    resolverFor: (canvasId, instanceId) => (ref, identity = {}) => {
      const base = `${canvasId}:${instanceId}:${ref}`;
      if (identity.value !== undefined) {
        const byValue = byKey.get(`${base}@${JSON.stringify(identity.value)}`);
        if (byValue !== undefined) return byValue.index;
      }
      return byKey.get(`${base}#${identity.occurrence ?? 0}`)?.index;
    },
  };
};

// The two contexts the wire slots wrap a canvas's tree and an instance's tree
// in (../react/slots.ts, `canvasProvider` / `instanceProvider`), each handing
// nova's ink kit the resolver for where it is.
export const markerProviders = (
  marks: Marks,
): {
  canvasProvider: FC<{ canvasId: string; children?: ReactNode }>;
  instanceProvider: FC<{ canvasId: string; instanceId: string; children?: ReactNode }>;
} => ({
  canvasProvider: ({ canvasId, children }) => createElement(CanvasMarkersContext.Provider, { value: marks.resolverFor(canvasId, '') }, children),
  instanceProvider: ({ canvasId, instanceId, children }) => createElement(CanvasMarkersContext.Provider, { value: marks.resolverFor(canvasId, instanceId) }, children),
});
