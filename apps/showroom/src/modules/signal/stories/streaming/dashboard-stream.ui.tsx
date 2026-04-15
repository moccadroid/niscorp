import type { FC } from 'react';
import type { Dashboard } from './dashboard-stream.recipe';

// ═══════════════════════════════════════════════════════════
// Renderer for the Dashboard shape. Pure presentational — fed
// by the live `current` value off the solid stream. Whatever
// fields are empty (still streaming) show placeholder dashes.
// ═══════════════════════════════════════════════════════════

const SEVERITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  critical: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  info: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
};

const TREND_ICON: Record<string, string> = { up: '\u2191', down: '\u2193', flat: '\u2192' };
const TREND_COLOR: Record<string, string> = { up: '#16a34a', down: '#dc2626', flat: '#6b7280' };

type Props = { value: Dashboard; streaming: boolean };

export const DashboardCard: FC<Props> = ({ value, streaming }) => (
  <div
    style={{
      background: '#ffffff',
      borderRadius: 12,
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      boxShadow: streaming ? '0 0 0 2px #2563eb20' : 'none',
    }}
  >
    <div
      style={{
        padding: '16px 20px',
        background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
        color: 'white',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value.header.title || '…'}</div>
      <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>{value.header.subtitle}</div>
      {value.header.status !== '' && (
        <span
          style={{
            display: 'inline-block',
            marginTop: 8,
            padding: '3px 10px',
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
        >
          {value.header.status}
        </span>
      )}
    </div>

    {value.kpis.length > 0 && (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 1,
          background: '#e2e8f0',
        }}
      >
        {value.kpis.map((kpi, i) => (
          <div key={i} style={{ padding: '14px 16px', background: '#ffffff' }}>
            <div
              style={{
                fontSize: 11,
                color: '#6b7280',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 0.3,
              }}
            >
              {kpi.label || '…'}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginTop: 4 }}>
              {kpi.value}
              <span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280', marginLeft: 2 }}>
                {kpi.unit}
              </span>
            </div>
            <div
              style={{
                fontSize: 12,
                color: TREND_COLOR[kpi.trend] ?? '#6b7280',
                marginTop: 2,
                fontWeight: 600,
              }}
            >
              {TREND_ICON[kpi.trend] ?? ''} {kpi.trend}
            </div>
          </div>
        ))}
      </div>
    )}

    {value.alerts.length > 0 && (
      <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0' }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 8,
          }}
        >
          Alerts
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {value.alerts.map((alert, i) => {
            const colors = SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS['info']!;
            return (
              <div
                key={i}
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  fontSize: 13,
                  color: colors.text,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>
                  {alert.severity}
                </span>
                <span>{alert.message}</span>
              </div>
            );
          })}
        </div>
      </div>
    )}

    {value.recommendations.length > 0 && (
      <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0' }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 8,
          }}
        >
          Recommendations
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {value.recommendations.map((rec, i) => (
            <div
              key={i}
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background:
                    rec.priority === 1 ? '#dc2626' : rec.priority === 2 ? '#f59e0b' : '#6b7280',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {rec.priority}
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{rec.action}</div>
                {rec.impact !== '' && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{rec.impact}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);
