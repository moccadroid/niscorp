import type { FC, ReactElement, ReactNode } from 'react';
import type { InspectorTabDef, Story } from '@showroom/modules/types';
import { INK } from '@showroom/chrome/stage/ui';
import { useVexRunView, type RunView } from './runtime-context';
import { Block, prettySql } from './parts';
import { scenarios, type VexScenario } from './scenarios';

// ═══════════════════════════════════════════════════════════
// Inspector tabs — alongside the chrome-provided Source tab, Vex
// adds DSL, SQL and Cache views fed by the last run (published to
// the runtime context by VexView).
// ═══════════════════════════════════════════════════════════

// A caption over a block — sentence case, like the stage.
const Cap: FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 12, fontWeight: 650, color: INK.soft, margin: '14px 0 6px' }}>{children}</div>
);

const pre = (body: string, error = false): ReactElement => <Block tone={error ? 'bad' : 'plain'} maxHeight={560}>{body}</Block>;

const Hint: FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 12.5, color: INK.soft, lineHeight: 1.55, marginTop: 10 }}>{children}</div>
);

const Wrap: FC<{ children: ReactNode }> = ({ children }) => <div style={{ padding: '4px 16px 16px', color: INK.text }}>{children}</div>;

const DslTab: FC<{ scenario: VexScenario }> = ({ scenario }) => {
  const view = useVexRunView();
  if (scenario.mode === 'mutate') {
    return (
      <Wrap>
        <Cap>{scenario.mutation !== undefined ? 'The stored write — it stays on the server' : 'What was sent — refused, not a request shape'}</Cap>
        {pre(JSON.stringify(scenario.mutation ?? scenario.body, null, 2))}
        <Cap>What the wire carries — the only shape a write accepts</Cap>
        {pre(JSON.stringify(scenario.body ?? { fingerprint: `vex-demo/${scenario.id}`, context: scenario.context ?? {} }, null, 2))}
      </Wrap>
    );
  }
  const dsl = view?.scenarioId === scenario.id ? view.dsl : scenario.dsl;
  return (
    <Wrap>
      <Cap>The shape the screen asked for</Cap>
      {pre(JSON.stringify(scenario.shape, null, 2))}
      <Cap>The DSL (parsed by its Zod schema)</Cap>
      {pre(JSON.stringify(dsl, null, 2))}
    </Wrap>
  );
};

const SqlTab: FC<{ scenario: VexScenario }> = ({ scenario }) => {
  const view = useVexRunView();
  const live = view?.scenarioId === scenario.id ? view : undefined;
  return (
    <Wrap>
      <Cap>The SQL vex compiled</Cap>
      {live?.error !== undefined
        ? pre(live.error, true)
        : scenario.mode === 'mutate'
          ? pre('Writes compile inside the mutation engine — a parameterized\nINSERT / UPDATE / DELETE … RETURNING *, through the same\noperator compiler reads use. Scope rules land as stamped\ncolumns (set) and AND-merged WHERE filters (match).')
          : pre(live?.sql !== undefined ? prettySql(live.sql) : 'Run the story to compile SQL.')}
      {live?.scopeClause !== undefined && (
        <>
          <Cap>The scope filter added on the server</Cap>
          {pre(`AND ${live.scopeClause}`)}
        </>
      )}
    </Wrap>
  );
};

// Where the DSL came from on the last run, in words.
const verdictText = (view: RunView | undefined): string => {
  if (view === undefined) return '—';
  if (view.live === true) return 'written by a model, then stored under the name';
  if (view.cacheHit === true) return 'found under the name and replayed — no model call';
  return 'slot was empty: the story’s hand-written DSL was stored, then replayed — no model call';
};

const CacheTab: FC<{ scenario: VexScenario }> = ({ scenario }) => {
  const view = useVexRunView();
  const live = view?.scenarioId === scenario.id ? view : undefined;
  const lines = [
    `fingerprint : ${live?.fingerprint ?? '—'}`,
    `verdict     : ${verdictText(live)}`,
    `model       : ${live?.timing?.agentMs !== undefined ? `${Math.round(live.timing.agentMs)}ms` : '— (no model call)'}`,
    `execution   : ${live?.timing?.executionMs !== undefined ? `${Math.round(live.timing.executionMs)}ms` : '—'}`,
    `mapping     : ${live?.timing?.mappingMs !== undefined ? `${Math.round(live.timing.mappingMs)}ms` : '— (shape matched)'}`,
    `total       : ${live?.timing?.totalMs !== undefined ? `${Math.round(live.timing.totalMs)}ms` : '—'}`,
  ];
  return (
    <Wrap>
      <Cap>The stored query, by name</Cap>
      {pre(lines.join('\n'))}
      <Hint>
        The cache key is the <em>fingerprint</em> — minted on generation or named by the caller. Context values are
        runtime data, not identity, so replaying the same fingerprint with different values reuses the same DSL.
      </Hint>
    </Wrap>
  );
};

// Best-effort extraction of the underlying provider error that Signal
// recovered from (groq nests code/message/failed_generation under .error).
const providerErrorText = (raw: unknown): string => {
  if (raw === null || typeof raw !== 'object') return String(raw ?? '(none)');
  const inner: unknown = Reflect.get(raw, 'error');
  const nested: object = inner !== null && typeof inner === 'object' ? inner : raw;
  const code: unknown = Reflect.get(nested, 'code') ?? Reflect.get(raw, 'code') ?? Reflect.get(raw, 'status');
  const message: unknown = Reflect.get(nested, 'message') ?? Reflect.get(raw, 'message');
  const failed: unknown = Reflect.get(nested, 'failed_generation');
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
  if (live === undefined) return <Wrap><Hint>Run the story to capture a transcript.</Hint></Wrap>;
  if (transcript.length === 0) {
    return (
      <Wrap>
        <Hint>
          No model calls — this run replayed the story’s DSL. Set “Who writes the DSL” to a model to capture the agent’s transcript.
        </Hint>
      </Wrap>
    );
  }
  return (
    <Wrap>
      {live.error !== undefined && (
        <>
          <Cap>Final error</Cap>
          {pre(live.error, true)}
        </>
      )}
      <Cap>LLM transcript — {transcript.length} call{transcript.length === 1 ? '' : 's'}</Cap>
      {transcript.map((x, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK.text, margin: '8px 0 4px' }}>
            #{x.iteration} · {x.label} · {x.finishReason} · {x.tokens}tok · {x.ms}ms
          </div>
          <div style={{ fontSize: 11.5, color: INK.soft, marginBottom: 4 }}>
            tools offered: [{x.tools.join(', ') || '—'}] · tool calls: {x.toolCalls.length}
          </div>
          {x.toolCalls.length > 0 && pre(x.toolCalls.map((tc) => `${tc.name}(${JSON.stringify(tc.args)})`).join('\n'))}
          <div style={{ fontSize: 11.5, color: INK.faint, margin: '6px 0 3px' }}>Response content</div>
          {pre(x.responseContent || '(empty)')}
          {x.finishReason === 'error_recovered' && (
            <>
              <div style={{ fontSize: 11.5, color: INK.faint, margin: '6px 0 3px' }}>Provider error Signal recovered from</div>
              {pre(providerErrorText(x.raw), true)}
            </>
          )}
        </div>
      ))}
    </Wrap>
  );
};

export const buildInspectorTabs = (story: Story): InspectorTabDef[] => {
  // The story rides its scenario along; finding it by id needs no cast.
  const scenario = scenarios.find((s) => s.id === story.id);
  if (scenario === undefined) return [];
  return [
    { id: 'dsl', label: 'DSL', render: () => <DslTab scenario={scenario} /> },
    { id: 'sql', label: 'SQL', render: () => <SqlTab scenario={scenario} /> },
    { id: 'cache', label: 'Cache', render: () => <CacheTab scenario={scenario} /> },
    { id: 'debug', label: 'Debug', render: () => <DebugTab scenario={scenario} /> },
  ];
};
