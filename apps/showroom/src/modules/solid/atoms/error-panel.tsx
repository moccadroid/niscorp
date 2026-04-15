import type { FC } from 'react';
import type { StreamError } from '@niscorp/solid';

// Renders a `stream.onError(...)` log. Shape comes from solid's
// `StreamError` type: `{ phase, path, expected, received, message }`.

export const ErrorPanel: FC<{ errors: StreamError[] }> = ({ errors }) =>
  errors.length === 0 ? null : (
    <div
      style={{
        marginBottom: 16,
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderLeft: '4px solid #f59e0b',
        borderRadius: 6,
        padding: '10px 14px',
        fontSize: 12,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
        color: '#78350f',
        maxHeight: 200,
        overflow: 'auto',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 6,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {errors.length} validation error{errors.length === 1 ? '' : 's'}
      </div>
      {errors.map((err, i) => (
        <div key={i} style={{ padding: '3px 0', borderTop: i === 0 ? 'none' : '1px dashed #fde68a' }}>
          <span style={{ color: '#b45309', fontWeight: 600 }}>[{err.phase}]</span>{' '}
          <span style={{ color: '#1f2937' }}>{err.path || '<root>'}</span>{' '}
          <span style={{ color: '#78350f' }}>
            {err.expected === err.received
              ? err.message
              : `expected ${err.expected}, got ${err.received}`}
          </span>
        </div>
      ))}
    </div>
  );
