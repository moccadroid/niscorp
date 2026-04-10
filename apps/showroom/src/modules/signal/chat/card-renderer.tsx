import type { FC } from 'react';

// ═══════════════════════════════════════════════════════════
// CardRenderer — renders the structured Card output from the
// ui-card recipe as an actual styled card. The point: model
// output drives UI directly. Schema mismatch falls back to
// JSON viewer in the calling Bubble.
// ═══════════════════════════════════════════════════════════

type Tone = 'neutral' | 'positive' | 'warning' | 'danger';
type Intent = 'primary' | 'secondary';

type Badge = { label: string; tone: Tone };
type Action = { label: string; intent: Intent };

export type CardData = {
  title: string;
  subtitle: string;
  body: string;
  badges: Badge[];
  actions: Action[];
};

export const isCardData = (value: unknown): value is CardData => {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string') return false;
  if (typeof v.subtitle !== 'string') return false;
  if (typeof v.body !== 'string') return false;
  if (!Array.isArray(v.badges)) return false;
  if (!Array.isArray(v.actions)) return false;
  return true;
};

const TONE_BG: Record<Tone, string> = {
  neutral: '#f3f4f6',
  positive: '#dcfce7',
  warning: '#fef3c7',
  danger: '#fee2e2',
};
const TONE_FG: Record<Tone, string> = {
  neutral: '#374151',
  positive: '#166534',
  warning: '#854d0e',
  danger: '#991b1b',
};
const TONE_BORDER: Record<Tone, string> = {
  neutral: '#e5e7eb',
  positive: '#bbf7d0',
  warning: '#fde68a',
  danger: '#fecaca',
};

export const CardRenderer: FC<{ card: CardData }> = ({ card }) => (
  <div
    style={{
      padding: 20,
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.04)',
    }}
  >
    {card.badges.length > 0 && (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {card.badges.map((b, i) => (
          <span
            key={i}
            style={{
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 600,
              background: TONE_BG[b.tone],
              color: TONE_FG[b.tone],
              border: `1px solid ${TONE_BORDER[b.tone]}`,
              borderRadius: 999,
              letterSpacing: 0.2,
            }}
          >
            {b.label}
          </span>
        ))}
      </div>
    )}
    <div
      style={{
        fontSize: 18,
        fontWeight: 700,
        color: '#111827',
        marginBottom: 4,
        letterSpacing: -0.2,
      }}
    >
      {card.title}
    </div>
    <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>{card.subtitle}</div>
    <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, marginBottom: 16 }}>
      {card.body}
    </div>
    {card.actions.length > 0 && (
      <div style={{ display: 'flex', gap: 8 }}>
        {card.actions.map((a, i) => (
          <button
            key={i}
            type="button"
            style={
              a.intent === 'primary'
                ? {
                    padding: '8px 16px',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }
                : {
                    padding: '8px 16px',
                    background: '#ffffff',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }
            }
          >
            {a.label}
          </button>
        ))}
      </div>
    )}
  </div>
);
