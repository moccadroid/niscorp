import { useState, type FC, type ReactNode } from 'react';
import type { ValidationMode } from '@niscorp/solid';

// Render-prop helper for demos that want to toggle between
// trust / recover / strict. The child is re-mounted on mode
// change (via key) so any internal state resets — matching
// what a user expects from flipping the toggle.

const MODE_TINT: Record<ValidationMode, string> = {
  trust: '#9ca3af',
  recover: '#2563eb',
  strict: '#dc2626',
};

const MODE_LABEL: Record<ValidationMode, string> = {
  trust: 'trust',
  recover: 'recover',
  strict: 'strict',
};

const MODE_DESCRIPTION: Record<ValidationMode, string> = {
  trust:
    'No validation. Every chunk is applied as-is — the stream reflects exactly what the LLM emitted. Debug only; a hallucinated field can break your UI.',
  recover:
    'Validate each chunk. On a bad value, reject it, keep the last valid snapshot for that path, fire an error, keep streaming. The default.',
  strict:
    'Validate each chunk. On the first violation, halt the stream, freeze the current snapshot, fire once, and reject the final() promise. Use when partial-bad data is worse than no data.',
};

type Props = {
  initial?: ValidationMode;
  children: (mode: ValidationMode) => ReactNode;
};

export const ModeSwitcher: FC<Props> = ({ initial = 'recover', children }) => {
  const [mode, setMode] = useState<ValidationMode>(initial);
  return (
    <>
      <div
        style={{
          maxWidth: 960,
          margin: '16px auto 0',
          padding: '0 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>ValidationMode</div>
          <div style={{ display: 'flex', gap: 2, background: '#f3f4f6', borderRadius: 6, padding: 2 }}>
            {(['trust', 'recover', 'strict'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 4,
                  border: 'none',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: mode === key ? '#ffffff' : 'transparent',
                  color: mode === key ? MODE_TINT[key] : '#6b7280',
                  boxShadow: mode === key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
                }}
              >
                {MODE_LABEL[key]}
              </button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12, color: MODE_TINT[mode], lineHeight: 1.5 }}>
          <span style={{ fontWeight: 600 }}>{MODE_LABEL[mode]}</span>
          <span style={{ color: '#6b7280' }}> — {MODE_DESCRIPTION[mode]}</span>
        </div>
      </div>
      <div key={mode}>{children(mode)}</div>
    </>
  );
};
