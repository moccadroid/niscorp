import type { FC } from 'react';
import { FinalBadge, Placeholder, Cursor, type PathStatus } from '../atoms';
import type { DashboardData } from './dashboard.demo';

type Props = { value: DashboardData; pathStatuses: Map<string, PathStatus> };

const MetricCard: FC<{
  label: string;
  metric: { value: string; trend: string; delta: string };
  done: boolean;
}> = ({ label, metric, done }) => (
  <div
    style={{
      padding: '12px 14px',
      background: '#ffffff',
      borderRadius: 8,
      border: `1px solid ${done ? '#86efac' : '#e2e8f0'}`,
      transition: 'border-color 300ms',
    }}
  >
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {label}
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
      {metric.value || <Placeholder width={60} />}
    </div>
    {metric.delta !== '' && (
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          marginTop: 2,
          color:
            metric.trend === 'up'
              ? label === 'Latency'
                ? '#dc2626'
                : '#16a34a'
              : label === 'Latency'
                ? '#16a34a'
                : '#dc2626',
        }}
      >
        {metric.trend === 'up' ? '\u2191' : '\u2193'} {metric.delta}
      </div>
    )}
  </div>
);

export const DashboardView: FC<Props> = ({ value, pathStatuses }) => {
  const metricsFinal = pathStatuses.get('metrics')?.isFinal ?? false;
  const statusFinal = pathStatuses.get('status')?.isFinal ?? false;
  const recFinal = pathStatuses.get('recommendation')?.isFinal ?? false;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
        {value.title || <Placeholder width={180} />}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <MetricCard label="Revenue" metric={value.metrics.revenue} done={metricsFinal} />
        <MetricCard label="Users" metric={value.metrics.users} done={metricsFinal} />
        <MetricCard label="Latency" metric={value.metrics.latency} done={metricsFinal} />
      </div>

      <div
        style={{
          padding: '12px 16px',
          background: '#ffffff',
          borderRadius: 8,
          border: `1px solid ${statusFinal ? '#86efac' : '#e2e8f0'}`,
          marginBottom: 8,
          transition: 'border-color 300ms',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            System Status
          </div>
          <FinalBadge done={statusFinal} />
        </div>
        {value.status.overall !== '' && (
          <div
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              background: value.status.overall === 'healthy' ? '#dcfce7' : '#fef3c7',
              color: value.status.overall === 'healthy' ? '#166534' : '#92400e',
              marginBottom: 8,
            }}
          >
            {value.status.overall}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {value.status.services.map((svc, i) => (
            <div
              key={i}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: 11,
                background:
                  svc.status === 'operational'
                    ? '#f0fdf4'
                    : svc.status === 'degraded'
                      ? '#fffbeb'
                      : '#fef2f2',
                color:
                  svc.status === 'operational'
                    ? '#166534'
                    : svc.status === 'degraded'
                      ? '#92400e'
                      : '#991b1b',
                border: `1px solid ${
                  svc.status === 'operational'
                    ? '#bbf7d0'
                    : svc.status === 'degraded'
                      ? '#fde68a'
                      : '#fecaca'
                }`,
              }}
            >
              {svc.name || '…'}: {svc.status || '…'}
            </div>
          ))}
        </div>
      </div>

      {(value.recommendation !== '' || recFinal) && (
        <div
          style={{
            padding: '12px 16px',
            background: '#eff6ff',
            borderRadius: 8,
            border: `1px solid ${recFinal ? '#86efac' : '#bfdbfe'}`,
            fontSize: 13,
            color: '#1e40af',
            lineHeight: 1.6,
            transition: 'border-color 300ms',
          }}
        >
          <span style={{ fontWeight: 600 }}>Recommendation: </span>
          {value.recommendation}
          {!recFinal && value.recommendation !== '' && <Cursor />}
        </div>
      )}
    </div>
  );
};
