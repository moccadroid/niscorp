import { createElement, type FC, type ReactNode } from 'react';
import { CanvasMarkersContext } from '@niscorp/nova/adapters/ink';
import type { MarkerResolve } from '@niscorp/nova/adapters/ink';
import { createTtyView } from '@niscorp/nova/adapters/tty';
import type { TtyInteractive } from '@niscorp/nova/adapters/tty';
import { defaultRegistry as ttyRegistry, fallback as ttyFallback } from '@niscorp/nova/adapters/tty/components';
import type { TerminalApi } from '../index';

export type Marks = {
  reindex: () => void;
  count: () => number;
  at: (index: number) => TtyInteractive | undefined;
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
        // By canvas, instance and ref, then by occurrence: the instances of a list canvas share refs,
        // and a table's rows share one ref in row order.
        const base = `${item.canvas}:${item.origin ?? ''}:${item.ref}`;
        const occurrence = seen.get(base) ?? 0;
        seen.set(base, occurrence + 1);
        byKey.set(`${base}#${occurrence}`, item);
        // A click's or a row's value does not change, so it is a key too. An input's changes as it is typed.
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

export const markerProviders = (
  marks: Marks,
): {
  canvasProvider: FC<{ canvasId: string; children?: ReactNode }>;
  instanceProvider: FC<{ canvasId: string; instanceId: string; children?: ReactNode }>;
} => ({
  canvasProvider: ({ canvasId, children }) => createElement(CanvasMarkersContext.Provider, { value: marks.resolverFor(canvasId, '') }, children),
  instanceProvider: ({ canvasId, instanceId, children }) => createElement(CanvasMarkersContext.Provider, { value: marks.resolverFor(canvasId, instanceId) }, children),
});
