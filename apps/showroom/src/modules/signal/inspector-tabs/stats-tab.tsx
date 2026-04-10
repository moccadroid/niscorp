import type { FC } from 'react';
import { useSignalView } from '../runtime-context';

// ═══════════════════════════════════════════════════════════
// Stats tab — meta info from the most recent live response.
// Shows tokens, latency, model, retries, tool calls. Empty
// state explains the user needs to send a message first.
// ═══════════════════════════════════════════════════════════

const LEGEND =
  'Token usage, latency, retries, and tool call counts from the most recent assistant response. Updates after every message you send.';

const Row: FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '8px 16px',
      borderBottom: '1px solid #f3f4f6',
      fontSize: 12,
    }}
  >
    <span style={{ color: '#6b7280' }}>{label}</span>
    <span style={{ color: '#1f2937', fontFamily: 'ui-monospace, Menlo, monospace' }}>{value}</span>
  </div>
);

export const StatsTab: FC = () => {
  const view = useSignalView();
  const result = view?.result;

  return (
    <div>
      <div
        style={{
          padding: '12px 16px',
          background: '#f3f4f6',
          color: '#4b5563',
          fontSize: 11,
          borderBottom: '1px solid #e5e7eb',
          fontStyle: 'italic',
        }}
      >
        {LEGEND}
      </div>
      {result === undefined ? (
        <div style={{ padding: 16, color: '#9ca3af', fontSize: 12 }}>
          No live response yet. Type a message in the chat and hit Send.
        </div>
      ) : (
        <div style={{ padding: '0 0 16px' }}>
          <Row label="Model" value={result.meta.model} />
          <Row label="Total tokens" value={result.meta.usage.totalTokens} />
          <Row label="Input tokens" value={result.meta.usage.inputTokens} />
          <Row label="Output tokens" value={result.meta.usage.outputTokens} />
          <Row label="Latency" value={`${result.meta.durationMs}ms`} />
          <Row label="Retries" value={result.meta.retries} />
          <Row label="Tool calls" value={result.meta.toolCalls.length} />
          <Row label="Provider errors" value={result.meta.provider.errors.length} />
        </div>
      )}
    </div>
  );
};
