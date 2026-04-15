import type { FC } from 'react';
import type { Response } from './structured-stream.recipe';

// ═══════════════════════════════════════════════════════════
// Renderer for the Response shape. Pure presentational — reads
// off the live `current` value the solid stream drives.
// ═══════════════════════════════════════════════════════════

type Props = { value: Response; streaming: boolean };

export const ResponseCard: FC<Props> = ({ value, streaming }) => (
  <div
    style={{
      background: '#ffffff',
      borderRadius: 12,
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      boxShadow: streaming ? '0 0 0 2px #2563eb20' : 'none',
      transition: 'box-shadow 300ms',
    }}
  >
    <div
      style={{
        padding: '16px 20px',
        background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {value.widget.icon !== '' && (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            color: 'white',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {value.widget.icon.charAt(0).toUpperCase()}
        </div>
      )}
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {value.widget.type || '…'}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
          {value.widget.title || '…'}
        </div>
      </div>
    </div>

    <div style={{ padding: '16px 20px' }}>
      <div
        style={{
          fontSize: 14,
          color: '#1f2937',
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          minHeight: 24,
        }}
      >
        {value.response || (
          <span style={{ color: '#d1d5db', fontStyle: 'italic' }}>Streaming response…</span>
        )}
        {streaming && value.response && <span style={{ color: '#9ca3af' }}>▌</span>}
      </div>
    </div>

    {value.reasoning !== '' && (
      <div
        style={{
          padding: '12px 20px',
          borderTop: '1px solid #f3f4f6',
          background: '#fafafa',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#9ca3af',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 4,
          }}
        >
          Reasoning
        </div>
        <div
          style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
        >
          {value.reasoning}
        </div>
      </div>
    )}

    {(value.meta.confidence > 0 || value.meta.sources > 0) && (
      <div
        style={{
          padding: '10px 20px',
          borderTop: '1px solid #f3f4f6',
          display: 'flex',
          gap: 16,
          fontSize: 12,
          color: '#9ca3af',
        }}
      >
        {value.meta.confidence > 0 && <span>Confidence: {value.meta.confidence.toFixed(1)}</span>}
        {value.meta.sources > 0 && <span>Sources: {value.meta.sources}</span>}
      </div>
    )}
  </div>
);
