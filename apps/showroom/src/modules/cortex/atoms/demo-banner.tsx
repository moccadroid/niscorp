import type { FC, ReactNode } from 'react';

// "What is this demo showing" callout that sits above the interactive
// area. Similar to chrome/Pitch but structured around a short tag +
// free prose body.

export const DemoBanner: FC<{ tag: string; children: ReactNode }> = ({ tag, children }) => (
  <div
    style={{
      padding: '16px 20px',
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
      {tag}
    </div>
    <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{children}</div>
  </div>
);
