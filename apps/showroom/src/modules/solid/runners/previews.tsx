import type { FC } from 'react';
import type { PathStatus } from './stream-demo-runner';

// ═══════════════════════════════════════════════════════════
// Live UI previews — actual rendered components from stream data
// ═══════════════════════════════════════════════════════════

type PreviewProps = {
  value: unknown;
  pathStatuses: Map<string, PathStatus>;
};

// Registry of story id → preview component
const PREVIEWS: Record<string, FC<PreviewProps>> = {
  'ai-response': AIResponsePreview,
  'search-results': SearchResultsPreview,
  'dashboard': DashboardPreview,
  'select-api': SelectApiPreview,
};

export const getPreview = (storyId: string): FC<PreviewProps> | undefined =>
  PREVIEWS[storyId];

// ───────────────────────────────────────────────────────────
// AI Response Card
// ───────────────────────────────────────────────────────────

type AIResponse = {
  widget: { type: string; title: string; icon: string };
  response: string;
  reasoning: string;
  sources: Array<{ title: string; url: string }>;
};

function AIResponsePreview({ value, pathStatuses }: PreviewProps) {
  const data = value as AIResponse;
  const widgetFinal = pathStatuses.get('widget')?.isFinal ?? false;
  const responseFinal = pathStatuses.get('response')?.isFinal ?? false;
  const reasoningFinal = pathStatuses.get('reasoning')?.isFinal ?? false;
  const sourcesFinal = pathStatuses.get('sources')?.isFinal ?? false;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        background: '#f8fafc', borderRadius: '10px 10px 0 0', border: '1px solid #e2e8f0', borderBottom: 'none',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: data.widget.type ? '#2563eb' : '#e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, color: 'white', transition: 'background 300ms',
        }}>
          {data.widget.icon ? iconChar(data.widget.icon) : ''}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', minHeight: 20 }}>
            {data.widget.title || <Placeholder />}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            {data.widget.type || 'waiting...'}
          </div>
        </div>
        <FinalBadge done={widgetFinal} />
      </div>

      {/* Response body */}
      <div style={{
        padding: '16px', background: '#ffffff',
        border: '1px solid #e2e8f0', borderBottom: 'none',
        minHeight: 80,
      }}>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: '#1e293b' }}>
          {data.response || <Placeholder width={300} />}
          {!responseFinal && data.response && <Cursor />}
        </div>
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <FinalBadge done={responseFinal} />
        </div>
      </div>

      {/* Reasoning */}
      {(data.reasoning || reasoningFinal) && (
        <div style={{
          padding: '12px 16px', background: '#f8fafc',
          border: '1px solid #e2e8f0', borderBottom: 'none',
          fontSize: 12, color: '#64748b', lineHeight: 1.6,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8', marginBottom: 4 }}>
            Reasoning
          </div>
          {data.reasoning || <Placeholder width={200} />}
          {!reasoningFinal && data.reasoning && <Cursor />}
          <div style={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end' }}>
            <FinalBadge done={reasoningFinal} />
          </div>
        </div>
      )}

      {/* Sources */}
      <div style={{
        padding: '12px 16px', background: '#f8fafc',
        borderRadius: '0 0 10px 10px', border: '1px solid #e2e8f0',
        fontSize: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8' }}>
            Sources ({data.sources.length})
          </span>
          <FinalBadge done={sourcesFinal} />
        </div>
        {data.sources.map((s, i) => (
          <div key={i} style={{ marginTop: 6, color: '#2563eb', fontSize: 12 }}>
            {s.title || <Placeholder width={150} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Search Results
// ───────────────────────────────────────────────────────────

type SearchData = {
  query: string;
  results: Array<{ title: string; url: string; snippet: string; relevance: number }>;
  answer: string;
};

function SearchResultsPreview({ value, pathStatuses }: PreviewProps) {
  const data = value as SearchData;
  const answerFinal = pathStatuses.get('answer')?.isFinal ?? false;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Search bar */}
      <div style={{
        padding: '10px 16px', background: '#ffffff', borderRadius: 8,
        border: '1px solid #e2e8f0', marginBottom: 12, fontSize: 14, color: '#0f172a',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ color: '#94a3b8' }}>Q</span>
        {data.query || <Placeholder width={250} />}
        {data.query && !pathStatuses.get('query')?.isFinal && <Cursor />}
      </div>

      {/* Result cards */}
      {data.results.map((result, i) => {
        const isFinal = pathStatuses.get(`results.${i}`)?.isFinal ?? false;
        return (
          <div key={i} style={{
            padding: '14px 16px', background: '#ffffff', borderRadius: 8,
            border: `1px solid ${isFinal ? '#86efac' : '#e2e8f0'}`,
            marginBottom: 8, transition: 'border-color 300ms',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#2563eb' }}>
                  {result.title || <Placeholder width={200} />}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {result.url || <Placeholder width={150} />}
                </div>
              </div>
              <FinalBadge done={isFinal} />
            </div>
            <div style={{ fontSize: 13, color: '#475569', marginTop: 8, lineHeight: 1.6 }}>
              {result.snippet || <Placeholder width={300} />}
              {!isFinal && result.snippet && <Cursor />}
            </div>
            {result.relevance > 0 && (
              <div style={{ marginTop: 8 }}>
                <RelevanceBar value={result.relevance} />
              </div>
            )}
          </div>
        );
      })}

      {/* Answer summary */}
      {(data.answer || answerFinal) && (
        <div style={{
          padding: '14px 16px', background: '#f0fdf4', borderRadius: 8,
          border: '1px solid #86efac', marginTop: 4, fontSize: 13,
          color: '#166534', lineHeight: 1.6,
        }}>
          <span style={{ fontWeight: 600 }}>Summary: </span>
          {data.answer}
          {!answerFinal && data.answer && <Cursor />}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Dashboard
// ───────────────────────────────────────────────────────────

type DashboardData = {
  title: string;
  metrics: {
    revenue: { value: string; trend: string; delta: string };
    users: { value: string; trend: string; delta: string };
    latency: { value: string; trend: string; delta: string };
  };
  status: { overall: string; services: Array<{ name: string; status: string }> };
  recommendation: string;
};

function DashboardPreview({ value, pathStatuses }: PreviewProps) {
  const data = value as DashboardData;
  const metricsFinal = pathStatuses.get('metrics')?.isFinal ?? false;
  const statusFinal = pathStatuses.get('status')?.isFinal ?? false;
  const recFinal = pathStatuses.get('recommendation')?.isFinal ?? false;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Title */}
      <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
        {data.title || <Placeholder width={180} />}
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        <MetricCard label="Revenue" metric={data.metrics.revenue} done={metricsFinal} />
        <MetricCard label="Users" metric={data.metrics.users} done={metricsFinal} />
        <MetricCard label="Latency" metric={data.metrics.latency} done={metricsFinal} />
      </div>

      {/* Status panel */}
      <div style={{
        padding: '12px 16px', background: '#ffffff', borderRadius: 8,
        border: `1px solid ${statusFinal ? '#86efac' : '#e2e8f0'}`,
        marginBottom: 8, transition: 'border-color 300ms',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            System Status
          </div>
          <FinalBadge done={statusFinal} />
        </div>
        {data.status.overall && (
          <div style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: data.status.overall === 'healthy' ? '#dcfce7' : '#fef3c7',
            color: data.status.overall === 'healthy' ? '#166534' : '#92400e',
            marginBottom: 8,
          }}>
            {data.status.overall}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {data.status.services.map((svc, i) => (
            <div key={i} style={{
              padding: '4px 10px', borderRadius: 4, fontSize: 11,
              background: svc.status === 'operational' ? '#f0fdf4' : svc.status === 'degraded' ? '#fffbeb' : '#fef2f2',
              color: svc.status === 'operational' ? '#166534' : svc.status === 'degraded' ? '#92400e' : '#991b1b',
              border: `1px solid ${svc.status === 'operational' ? '#bbf7d0' : svc.status === 'degraded' ? '#fde68a' : '#fecaca'}`,
            }}>
              {svc.name || '...'}: {svc.status || '...'}
            </div>
          ))}
        </div>
      </div>

      {/* Recommendation */}
      {(data.recommendation || recFinal) && (
        <div style={{
          padding: '12px 16px', background: '#eff6ff', borderRadius: 8,
          border: `1px solid ${recFinal ? '#86efac' : '#bfdbfe'}`,
          fontSize: 13, color: '#1e40af', lineHeight: 1.6,
          transition: 'border-color 300ms',
        }}>
          <span style={{ fontWeight: 600 }}>Recommendation: </span>
          {data.recommendation}
          {!recFinal && data.recommendation && <Cursor />}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Select API — four independent panels
// ───────────────────────────────────────────────────────────

type SelectData = {
  header: { title: string; subtitle: string; badge: string };
  analysis: string;
  details: { confidence: number; categories: string[]; language: string };
  meta: { model: string; latency: string; tokens: number };
};

function SelectApiPreview({ value, pathStatuses }: PreviewProps) {
  const data = value as SelectData;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 640, margin: '0 auto' }}>
      <SelectPanel
        title="stream.select('header')"
        status={pathStatuses.get('header')}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
          {data.header.title || <Placeholder width={140} />}
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
          {data.header.subtitle || <Placeholder width={180} />}
        </div>
        {data.header.badge && (
          <div style={{
            display: 'inline-block', marginTop: 8, padding: '2px 8px',
            borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: data.header.badge === 'positive' ? '#dcfce7' : '#fef3c7',
            color: data.header.badge === 'positive' ? '#166534' : '#92400e',
          }}>
            {data.header.badge}
          </div>
        )}
      </SelectPanel>

      <SelectPanel
        title="stream.select('details')"
        status={pathStatuses.get('details')}
      >
        {data.details.confidence > 0 ? (
          <>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
              {(data.details.confidence * 100).toFixed(0)}%
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>confidence</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {data.details.categories.map((cat, i) => (
                <span key={i} style={{
                  padding: '2px 6px', borderRadius: 3, fontSize: 10,
                  background: '#eff6ff', color: '#2563eb', fontWeight: 500,
                }}>
                  {cat}
                </span>
              ))}
            </div>
          </>
        ) : (
          <Placeholder width={80} />
        )}
      </SelectPanel>

      <div style={{ gridColumn: '1 / -1' }}>
        <SelectPanel
          title="stream.select('analysis')"
          status={pathStatuses.get('analysis')}
        >
          <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
            {data.analysis || <Placeholder width={300} />}
            {data.analysis && !pathStatuses.get('analysis')?.isFinal && <Cursor />}
          </div>
        </SelectPanel>
      </div>

      <div style={{ gridColumn: '1 / -1' }}>
        <SelectPanel
          title="stream.select('meta')"
          status={pathStatuses.get('meta')}
        >
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b' }}>
            <span>Model: <b style={{ color: '#0f172a' }}>{data.meta.model || '...'}</b></span>
            <span>Latency: <b style={{ color: '#0f172a' }}>{data.meta.latency || '...'}</b></span>
            <span>Tokens: <b style={{ color: '#0f172a' }}>{data.meta.tokens || '...'}</b></span>
          </div>
        </SelectPanel>
      </div>
    </div>
  );
}

const SelectPanel: FC<{
  title: string;
  status: PathStatus | undefined;
  children: React.ReactNode;
}> = ({ title, status, children }) => {
  const isFinal = status?.isFinal ?? false;
  return (
    <div style={{
      padding: '12px 14px',
      background: '#ffffff',
      borderRadius: 8,
      border: `1px solid ${isFinal ? '#86efac' : '#e2e8f0'}`,
      transition: 'border-color 300ms',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #f1f5f9',
      }}>
        <code style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'ui-monospace, Menlo, monospace' }}>
          {title}
        </code>
        <FinalBadge done={isFinal} />
      </div>
      {children}
    </div>
  );
};

// ───────────────────────────────────────────────────────────
// Shared UI atoms
// ───────────────────────────────────────────────────────────

const Placeholder: FC<{ width?: number }> = ({ width = 120 }) => (
  <span style={{
    display: 'inline-block', width, height: 14, borderRadius: 4,
    background: '#e2e8f0', verticalAlign: 'middle',
  }} />
);

const Cursor: FC = () => (
  <span style={{
    display: 'inline-block', width: 2, height: 14,
    background: '#2563eb', marginLeft: 1, verticalAlign: 'middle',
    animation: 'solid-cursor-blink 1s step-end infinite',
  }}>
    <style>{`@keyframes solid-cursor-blink { 50% { opacity: 0; } }`}</style>
  </span>
);

const FinalBadge: FC<{ done: boolean }> = ({ done }) => (
  <span style={{
    fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
    background: done ? '#dcfce7' : '#f1f5f9',
    color: done ? '#166534' : '#cbd5e1',
    transition: 'all 300ms',
  }}>
    {done ? 'FINAL' : '...'}
  </span>
);

const RelevanceBar: FC<{ value: number }> = ({ value }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div style={{ flex: 1, height: 4, background: '#e2e8f0', borderRadius: 2 }}>
      <div style={{
        height: '100%', borderRadius: 2, transition: 'width 200ms',
        width: `${value * 100}%`,
        background: value > 0.9 ? '#22c55e' : value > 0.7 ? '#eab308' : '#94a3b8',
      }} />
    </div>
    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>
      {(value * 100).toFixed(0)}%
    </span>
  </div>
);

const MetricCard: FC<{ label: string; metric: { value: string; trend: string; delta: string }; done: boolean }> = ({ label, metric, done }) => (
  <div style={{
    padding: '12px 14px', background: '#ffffff', borderRadius: 8,
    border: `1px solid ${done ? '#86efac' : '#e2e8f0'}`,
    transition: 'border-color 300ms',
  }}>
    <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {label}
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
      {metric.value || <Placeholder width={60} />}
    </div>
    {metric.delta && (
      <div style={{
        fontSize: 12, fontWeight: 600, marginTop: 2,
        color: metric.trend === 'up' ? (label === 'Latency' ? '#dc2626' : '#16a34a') : (label === 'Latency' ? '#16a34a' : '#dc2626'),
      }}>
        {metric.trend === 'up' ? '\u2191' : '\u2193'} {metric.delta}
      </div>
    )}
  </div>
);

function iconChar(icon: string): string {
  switch (icon) {
    case 'search': return '\u{1F50D}';
    case 'trending-up': return '\u2197';
    default: return '\u2728';
  }
}
