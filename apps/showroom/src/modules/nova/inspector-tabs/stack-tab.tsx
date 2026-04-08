import type { CSSProperties, FC } from 'react';
import { useRuntimeView } from '../runtime-context';

const LEGEND_STYLE: CSSProperties = {
  padding: '12px 16px',
  background: '#f3f4f6',
  color: '#4b5563',
  fontSize: 11,
  borderBottom: '1px solid #e5e7eb',
  fontStyle: 'italic',
};

export const StackTab: FC = () => {
  const view = useRuntimeView();
  const canvasStates = view?.canvasStates;

  return (
    <div>
      <div style={LEGEND_STYLE}>
        The shell&apos;s canvas stack. Each canvas has a stack of action instances; the topmost is
        active.
      </div>
      <div style={{ padding: 16 }}>
        {canvasStates === undefined || Object.keys(canvasStates).length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: 12 }}>
            No canvas state — this story is not a shell story or the shell has no canvases.
          </div>
        ) : (
          Object.entries(canvasStates).map(([canvasId, canvas]) => (
            <div key={canvasId} style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                canvas: {canvasId}
              </div>
              {canvas.stack.length === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: 11, paddingLeft: 12 }}>(empty)</div>
              ) : (
                <ol
                  style={{
                    margin: 0,
                    paddingLeft: 20,
                    fontSize: 11,
                    fontFamily: 'ui-monospace, Menlo, monospace',
                  }}
                >
                  {canvas.stack.map((inst) => {
                    const isActive = canvas.active?.id === inst.id;
                    return (
                      <li
                        key={inst.id}
                        style={{
                          padding: '4px 8px',
                          background: isActive ? '#dbeafe' : 'transparent',
                          borderRadius: 4,
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        {inst.definitionId}{' '}
                        <span style={{ color: '#9ca3af' }}>({inst.status})</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
