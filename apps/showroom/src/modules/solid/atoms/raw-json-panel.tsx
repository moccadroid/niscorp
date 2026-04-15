import type { FC } from 'react';

// Fallback view for demos without a dedicated preview component.

export const RawJsonPanel: FC<{ value: unknown }> = ({ value }) => (
  <div
    style={{
      background: '#1e1e1e',
      color: '#d4d4d4',
      borderRadius: 8,
      padding: 16,
      fontSize: 12,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
      lineHeight: 1.6,
      overflow: 'auto',
      maxHeight: 400,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }}
  >
    {JSON.stringify(value, null, 2)}
  </div>
);
