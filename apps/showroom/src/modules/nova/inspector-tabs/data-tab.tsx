import { useCallback, useRef, useSyncExternalStore, type FC } from 'react';
import type { Shell, CanvasState } from '@niscorp/nova';
import type { NovaStory } from '@showroom/modules/nova/story-types';

// ═══════════════════════════════════════════════════════════
// Data tab — shows live action-instance data, one section per
// canvas. For each canvas with an active action, we render the
// action id + instance id + the data bag as key/value rows.
//
// Subscribes to shell.onStateChange via useSyncExternalStore
// with a cached snapshot (shell.getState allocates a fresh
// object each call, so the cache is required to avoid an
// infinite re-render loop).
// ═══════════════════════════════════════════════════════════

type Cache = {
  shell: Shell;
  canvases: Record<string, CanvasState>;
};

const useCanvases = (shell: Shell): Record<string, CanvasState> => {
  const cacheRef = useRef<Cache | undefined>(undefined);

  const subscribe = useCallback(
    (cb: () => void) =>
      shell.onStateChange(() => {
        cacheRef.current = { shell, canvases: shell.getState().canvases };
        cb();
      }),
    [shell],
  );

  const getSnapshot = useCallback((): Record<string, CanvasState> => {
    const cached = cacheRef.current;
    if (cached === undefined || cached.shell !== shell) {
      const canvases = shell.getState().canvases;
      cacheRef.current = { shell, canvases };
      return canvases;
    }
    return cached.canvases;
  }, [shell]);

  return useSyncExternalStore(subscribe, getSnapshot);
};

const DataRows: FC<{ data: Record<string, unknown> }> = ({ data }) => {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>(empty)</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' }}>
          <span style={{ color: '#6b7280', minWidth: 100 }}>{k}</span>
          <span style={{ color: '#111827', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v)}
          </span>
        </div>
      ))}
    </div>
  );
};

const CanvasSection: FC<{ canvas: CanvasState }> = ({ canvas }) => (
  <div
    style={{
      padding: 12,
      border: '1px solid #e5e7eb',
      borderRadius: 6,
      background: '#f9fafb',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}
  >
    <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
      Canvas <span style={{ color: '#111827', fontWeight: 600 }}>{canvas.id}</span>
      <span style={{ color: '#9ca3af', marginLeft: 8 }}>
        · stack {canvas.stack.length}
      </span>
    </div>
    {canvas.active === undefined ? (
      <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>no active action</div>
    ) : (
      <>
        <div style={{ fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' }}>
          <span style={{ color: '#2563eb', fontWeight: 600 }}>{canvas.active.definitionId}</span>
          <span style={{ color: '#9ca3af', marginLeft: 8 }}>#{canvas.active.id}</span>
          <span style={{ color: '#9ca3af', marginLeft: 8 }}>· {canvas.active.status}</span>
        </div>
        <DataRows data={canvas.active.data} />
      </>
    )}
  </div>
);

const LiveData: FC<{ shell: Shell }> = ({ shell }) => {
  const canvases = useCanvases(shell);
  const ids = Object.keys(canvases);
  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {ids.map((id) => {
        const canvas = canvases[id];
        if (canvas === undefined) return null;
        return <CanvasSection key={id} canvas={canvas} />;
      })}
    </div>
  );
};

export const DataTab: FC<{ story: NovaStory }> = ({ story }) => {
  if (story.shell === undefined) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: '#9ca3af' }}>
        This story has no shell — no live data to show.
      </div>
    );
  }
  return <LiveData shell={story.shell} />;
};
