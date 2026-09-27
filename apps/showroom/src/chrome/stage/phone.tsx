import type { FC, ReactNode } from 'react';

// ═══════════════════════════════════════════════════════════
// A phone — the frame every "what does a person actually see" demo draws in.
// The ring says how to read what is inside: green is right, red is wrong.
// ═══════════════════════════════════════════════════════════

export type PhoneTone = 'ok' | 'bad' | 'plain' | 'accent';

const RING: Record<PhoneTone, string> = { ok: '#10b981', bad: '#ef4444', plain: '#e5e7eb', accent: '#6366f1' };

export const PhoneFrame: FC<{ tone?: PhoneTone; width?: number; status?: ReactNode; minHeight?: number; children: ReactNode }> = ({
  tone = 'plain',
  width = 300,
  status,
  minHeight = 330,
  children,
}) => (
  <div
    className="stage-phone"
    style={{
      width,
      maxWidth: '100%',
      borderRadius: 28,
      padding: 8,
      background: '#111827',
      boxShadow: `0 0 0 3px ${RING[tone]}, 0 18px 40px -18px rgba(17,24,39,0.45)`,
      transition: 'box-shadow 200ms',
      boxSizing: 'border-box',
    }}
  >
    <div style={{ borderRadius: 21, background: '#f6f7f9', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 16px 4px', fontSize: 10.5, fontWeight: 600, color: '#374151' }}>
        <span>9:41</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status}</span>
      </div>
      <div style={{ padding: '10px 14px 18px', minHeight }}>{children}</div>
    </div>
  </div>
);

// Nova's lax renderer marks a component it cannot find instead of throwing; this
// is how that marker looks inside a phone.
export const PhoneStyles: FC = () => (
  <style>{`
    .stage-phone [data-nova-error] {
      display: block; padding: 10px 12px; border-radius: 10px;
      border: 1px dashed #fca5a5; background: #fef2f2; color: #b91c1c;
      font: 11px/1.4 ui-monospace, Menlo, monospace;
    }
  `}</style>
);
