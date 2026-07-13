import type { FC, ReactElement, ReactNode } from 'react';
import type { InspectorTabDef, Story } from '@showroom/modules/types';
import { useVexRunView } from './runtime-context';
import type { VexScenario } from './scenarios';

// ═══════════════════════════════════════════════════════════
// Inspector tabs — alongside the chrome-provided Source tab, Vex
// adds DSL, SQL and Cache views fed by the last run (published to
// the runtime context by VexView).
// ═══════════════════════════════════════════════════════════

const labelStyle = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
  color: '#6b7280',
  margin: '12px 0 6px',
};

const pre = (body: string, error = false): ReactElement => (
  <pre
    style={{
      margin: 0,
      padding: 12,
      background: error ? '#fef2f2' : '#f9fafb',
      color: error ? '#991b1b' : '#1f2937',
      border: `1px solid ${error ? '#fecaca' : '#e5e7eb'}`,
      borderRadius: 6,
      fontSize: 12,
      fontFamily: 'ui-monospace, Menlo, monospace',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      overflow: 'auto',
    }}
  >
    {body}
  </pre>
);

const Wrap: FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ padding: 16 }}>{children}</div>
);

const DslTab: FC<{ scenario: VexScenario }> = ({ scenario }) => {
  const view = useVexRunView();
  const dsl = view?.scenarioId === scenario.id ? view.dsl : scenario.dsl;
  return (
    <Wrap>
      <div style={labelStyle}>Requested shape</div>
      {pre(JSON.stringify(scenario.shape, null, 2))}
      <div style={labelStyle}>DSL (Zod-validated)</div>
      {pre(JSON.stringify(dsl, null, 2))}
    </Wrap>
  );
};

const SqlTab: FC<{ scenario: VexScenario }> = ({ scenario }) => {
  const view = useVexRunView();
  const live = view?.scenarioId === scenario.id ? view : undefined;
  return (
    <Wrap>
      <div style={labelStyle}>Compiled SQL</div>
      {live?.error !== undefined
        ? pre(live.error, true)
        : pre(live?.sql ?? 'Run the story to compile SQL.')}
      {live?.scopeClause !== undefined && (
        <>
          <div style={labelStyle}>Injected scope filter</div>
          {pre(`AND ${live.scopeClause}`)}
        </>
      )}
    </Wrap>
  );
};

const CacheTab: FC<{ scenario: VexScenario }> = ({ scenario }) => {
  const view = useVexRunView();
  const live = view?.scenarioId === scenario.id ? view : undefined;
  const lines = [
    `fingerprint : ${live?.fingerprint ?? '—'}`,
    `verdict   : ${live === undefined ? '—' : live.cacheHit ? 'HIT (DSL reused, 0 LLM)' : 'generated + cached'}`,
    `agent     : ${live?.timing?.agentMs !== undefined ? `${Math.round(live.timing.agentMs)}ms` : '— (cached)'}`,
    `execution : ${live?.timing?.executionMs !== undefined ? `${Math.round(live.timing.executionMs)}ms` : '—'}`,
    `mapping   : ${live?.timing?.mappingMs !== undefined ? `${Math.round(live.timing.mappingMs)}ms` : '— (shape matched)'}`,
    `total     : ${live?.timing?.totalMs !== undefined ? `${Math.round(live.timing.totalMs)}ms` : '—'}`,
  ];
  return (
    <Wrap>
      <div style={labelStyle}>Fingerprint cache</div>
      {pre(lines.join('\n'))}
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10 }}>
        The cache key is the <em>fingerprint</em> — minted on generation or caller-named. Context values are
        runtime data, not identity, so replaying the same fingerprint with different values reuses the same DSL.
      </div>
    </Wrap>
  );
};

// Best-effort extraction of the underlying provider error that Signal
// recovered from (groq nests code/message/failed_generation under .error).
const providerErrorText = (raw: unknown): string => {
  if (raw === null || typeof raw !== 'object') return String(raw ?? '(none)');
  const rec = raw as Record<string, unknown>;
  const nested = (rec.error ?? rec) as Record<string, unknown>;
  const code = nested.code ?? rec.code ?? rec.status;
  const message = nested.message ?? rec.message;
  const failed = nested.failed_generation;
  const lines: string[] = [];
  if (code !== undefined) lines.push(`code: ${String(code)}`);
  if (message !== undefined) lines.push(`message: ${String(message)}`);
  if (failed !== undefined) lines.push(`failed_generation: ${typeof failed === 'string' ? failed : JSON.stringify(failed)}`);
  if (lines.length === 0) {
    try { return JSON.stringify(raw, null, 2).slice(0, 4000); } catch { return String(raw); }
  }
  return lines.join('\n');
};

const DebugTab: FC<{ scenario: VexScenario }> = ({ scenario }) => {
  const view = useVexRunView();
  const live = view?.scenarioId === scenario.id ? view : undefined;
  const transcript = live?.transcript ?? [];
  if (live === undefined) return <Wrap><div style={{ fontSize: 12, color: '#6b7280' }}>Run the story to capture a transcript.</div></Wrap>;
  if (transcript.length === 0) {
    return (
      <Wrap>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          No LLM calls — this run used the cached path (canned mode). Switch Mode to Live to capture the agent transcript.
        </div>
      </Wrap>
    );
  }
  return (
    <Wrap>
      {live.error !== undefined && (
        <>
          <div style={labelStyle}>Final error</div>
          {pre(live.error, true)}
        </>
      )}
      <div style={labelStyle}>LLM transcript — {transcript.length} call{transcript.length === 1 ? '' : 's'}</div>
      {transcript.map((x, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', margin: '8px 0 4px' }}>
            #{x.iteration} · {x.label} · {x.finishReason} · {x.tokens}tok · {x.ms}ms
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
            tools offered: [{x.tools.join(', ') || '—'}] · tool calls: {x.toolCalls.length}
          </div>
          {x.toolCalls.length > 0 && pre(x.toolCalls.map((tc) => `${tc.name}(${JSON.stringify(tc.args)})`).join('\n'))}
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#9ca3af', margin: '6px 0 3px' }}>response content</div>
          {pre(x.responseContent || '(empty)')}
          {x.finishReason === 'error_recovered' && (
            <>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#9ca3af', margin: '6px 0 3px' }}>swallowed provider error</div>
              {pre(providerErrorText(x.raw), true)}
            </>
          )}
        </div>
      ))}
    </Wrap>
  );
};

export const buildInspectorTabs = (story: Story): InspectorTabDef[] => {
  const scenario = story.scenario as VexScenario | undefined;
  if (scenario === undefined) return [];
  return [
    { id: 'dsl', label: 'DSL', render: () => <DslTab scenario={scenario} /> },
    { id: 'sql', label: 'SQL', render: () => <SqlTab scenario={scenario} /> },
    { id: 'cache', label: 'Cache', render: () => <CacheTab scenario={scenario} /> },
    { id: 'debug', label: 'Debug', render: () => <DebugTab scenario={scenario} /> },
  ];
};
