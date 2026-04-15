import type { FC } from 'react';
import { Cursor, FinalBadge, Placeholder, type PathStatus } from './_atoms';
import type { Response } from './ai-response.recipe';

// ═══════════════════════════════════════════════════════════
// Chat response card that fills in as solid drives its value.
// Purely presentational — nothing in this file talks to solid
// directly. The recipe subscribes and passes `value` + path
// statuses (for the FINAL badges) down.
// ═══════════════════════════════════════════════════════════

type Props = { value: Response; pathStatuses: Map<string, PathStatus> };

const iconChar = (icon: string): string => {
  if (icon === 'search') return '\u{1F50D}';
  if (icon === 'trending-up') return '\u2197';
  return '\u2728';
};

export const AIResponseCard: FC<Props> = ({ value, pathStatuses }) => {
  const widgetFinal = pathStatuses.get('widget')?.isFinal ?? false;
  const responseFinal = pathStatuses.get('response')?.isFinal ?? false;
  const reasoningFinal = pathStatuses.get('reasoning')?.isFinal ?? false;
  const sourcesFinal = pathStatuses.get('sources')?.isFinal ?? false;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: '#f8fafc',
          borderRadius: '10px 10px 0 0',
          border: '1px solid #e2e8f0',
          borderBottom: 'none',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: value.widget.type !== '' ? '#2563eb' : '#e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            color: 'white',
            transition: 'background 300ms',
          }}
        >
          {value.widget.icon !== '' ? iconChar(value.widget.icon) : ''}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', minHeight: 20 }}>
            {value.widget.title || <Placeholder />}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            {value.widget.type || 'waiting…'}
          </div>
        </div>
        <FinalBadge done={widgetFinal} />
      </div>

      <div
        style={{
          padding: '16px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderBottom: 'none',
          minHeight: 80,
        }}
      >
        <div style={{ fontSize: 14, lineHeight: 1.7, color: '#1e293b' }}>
          {value.response || <Placeholder width={300} />}
          {!responseFinal && value.response !== '' && <Cursor />}
        </div>
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <FinalBadge done={responseFinal} />
        </div>
      </div>

      {(value.reasoning !== '' || reasoningFinal) && (
        <div
          style={{
            padding: '12px 16px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderBottom: 'none',
            fontSize: 12,
            color: '#64748b',
            lineHeight: 1.6,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: '#94a3b8',
              marginBottom: 4,
            }}
          >
            Reasoning
          </div>
          {value.reasoning || <Placeholder width={200} />}
          {!reasoningFinal && value.reasoning !== '' && <Cursor />}
          <div style={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end' }}>
            <FinalBadge done={reasoningFinal} />
          </div>
        </div>
      )}

      <div
        style={{
          padding: '12px 16px',
          background: '#f8fafc',
          borderRadius: '0 0 10px 10px',
          border: '1px solid #e2e8f0',
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: '#94a3b8',
            }}
          >
            Sources ({value.sources.length})
          </span>
          <FinalBadge done={sourcesFinal} />
        </div>
        {value.sources.map((s, i) => (
          <div key={i} style={{ marginTop: 6, color: '#2563eb', fontSize: 12 }}>
            {s.title || <Placeholder width={150} />}
          </div>
        ))}
      </div>
    </div>
  );
};
