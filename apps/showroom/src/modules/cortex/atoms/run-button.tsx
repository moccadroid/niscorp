import type { FC } from 'react';
import { PROVIDER, DEFAULT_MODEL } from './constants';

// Primary run button + provider/model badge. Every demo kind mounts
// this above its specific result surface.

export const RunButton: FC<{
  label: string;
  runningLabel: string;
  onRun: () => void;
  isRunning: boolean;
}> = ({ label, runningLabel, onRun, isRunning }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <button
      type="button"
      onClick={onRun}
      disabled={isRunning}
      style={{
        padding: '10px 18px',
        background: isRunning ? '#9ca3af' : '#2563eb',
        color: 'white',
        border: 'none',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        cursor: isRunning ? 'wait' : 'pointer',
      }}
    >
      {isRunning ? runningLabel : label}
    </button>
    <div style={{ fontSize: 12, color: '#6b7280' }}>
      provider: <strong>{PROVIDER}</strong> · model: <strong>{DEFAULT_MODEL}</strong>
    </div>
  </div>
);
