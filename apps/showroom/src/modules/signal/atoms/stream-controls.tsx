import type { FC } from 'react';

export type RunState = 'idle' | 'streaming' | 'done' | 'error';

type Props = {
  state: RunState;
  onStart: () => void;
  onStop: () => void;
};

// Start / Streaming… / Restart button (label tracks state) plus
// a Stop button that appears only while streaming.
export const StreamControls: FC<Props> = ({ state, onStart, onStop }) => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '0 0 16px 0' }}>
    <button
      onClick={onStart}
      disabled={state === 'streaming'}
      style={{
        padding: '8px 20px',
        borderRadius: 6,
        border: 'none',
        background: state === 'streaming' ? '#d1d5db' : '#2563eb',
        color: 'white',
        fontWeight: 600,
        fontSize: 13,
        cursor: state === 'streaming' ? 'default' : 'pointer',
      }}
    >
      {state === 'streaming' ? 'Streaming…' : state === 'idle' ? 'Start' : 'Restart'}
    </button>
    {state === 'streaming' && (
      <button
        onClick={onStop}
        style={{
          padding: '8px 16px',
          borderRadius: 6,
          border: '1px solid #fecaca',
          background: '#fef2f2',
          color: '#dc2626',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Stop
      </button>
    )}
  </div>
);
