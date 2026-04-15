import type { FC } from 'react';

// ═══════════════════════════════════════════════════════════
// Pitch — "why this matters" callout above a demo.
//
// Shared chrome primitive. Any module's demo can drop one at
// the top of its content to set up the story's motivation
// before the interactive part loads.
// ═══════════════════════════════════════════════════════════

type Props = {
  headline: string;
  body: string;
};

export const Pitch: FC<Props> = ({ headline, body }) => (
  <div
    style={{
      maxWidth: 880,
      margin: '24px auto 0',
      padding: '20px 24px',
      background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
      border: '1px solid #dbeafe',
      borderLeft: '4px solid #2563eb',
      borderRadius: 10,
    }}
  >
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#2563eb',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 6,
      }}
    >
      Why this matters
    </div>
    <div
      style={{
        fontSize: 16,
        fontWeight: 700,
        color: '#111827',
        marginBottom: 6,
        letterSpacing: -0.2,
      }}
    >
      {headline}
    </div>
    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{body}</div>
  </div>
);
