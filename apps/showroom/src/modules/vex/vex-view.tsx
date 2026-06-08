import { useCallback, useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { useVexBoot, useVexRunSetter } from './runtime-context';
import { runScenario, type RunOutcome } from './run';
import { scopePolicy } from './runtime/scope';
import { hasGenerationKey } from './runtime/live';
import { availableProviders, getLiveConfig, setLiveConfig, PROVIDER_MODELS } from './runtime/live-config';
import { startRecording, stopRecording } from './runtime/live-debug';
import { ACCOUNTS } from './runtime/seed-data';
import type { RecipeProvider } from '@showroom/modules/signal/openai-client';
import type { VexScenario } from './scenarios';
import type { Query, VexEvent } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════
// VexView — the showroom canvas for a Vex scenario. Runs the real
// engine against PGlite ONLY when Run is pressed, and advances the
// pipeline from the LIVE event stream: Intent/Cache light up the
// instant they happen, Generate pulses while the LLM works, and each
// artifact panel pops in as its stage completes. A displayed
// "frontier" chases the event-driven target at a capped rate so even
// the (instant) canned path sweeps through visibly.
// ═══════════════════════════════════════════════════════════

const C = {
  border: '#e5e7eb',
  muted: '#6b7280',
  text: '#1f2937',
  panel: '#f9fafb',
  accent: '#4f46e5',
  green: '#059669',
  greenBg: '#ecfdf5',
  amber: '#b45309',
  amberBg: '#fffbeb',
  red: '#991b1b',
  redBg: '#fef2f2',
};

const KEYFRAMES = `
@keyframes vexPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(79,70,229,0); } 50% { box-shadow: 0 0 0 5px rgba(79,70,229,0.22); } }
@keyframes vexPop { from { transform: translateY(6px); opacity: 0; } to { transform: none; opacity: 1; } }
`;

const DWELL = 120; // ms the displayed frontier waits before advancing one stage

const ACCOUNT_LABEL = (id: string): string => `Account ${String.fromCharCode(65 + ACCOUNTS.indexOf(id))}`;
const accountLabelMaybe = (id: string): string => (ACCOUNTS.includes(id) ? ACCOUNT_LABEL(id) : id);
const delay = (n: number): Promise<void> => new Promise((r) => setTimeout(r, n));
const ms = (n: number | undefined): string => (n === undefined ? '' : `${Math.max(0, Math.round(n))}ms`);

// ─── Live facts, accumulated from the event stream ───────────

type Facts = {
  scoped: boolean;
  reshape: boolean;
  live: boolean;
  cacheHit?: boolean;
  agentMs?: number;
  warnings?: string[];
  rowCount?: number;
  executionMs?: number;
  mappingMs?: number;
  totalMs?: number;
  error?: string;
};

type StageStatus = 'done' | 'active' | 'skipped' | 'warn' | 'error' | 'idle';
type StageDef = { label: string; panel?: string };

const STAGES_EXECUTE: StageDef[] = [
  { label: 'Intent' },
  { label: 'Cache' },
  { label: 'Generate', panel: 'dsl' },
  { label: 'Scope', panel: 'scope' },
  { label: 'Analyze', panel: 'warn' },
  { label: 'Compile SQL', panel: 'sql' },
  { label: 'Execute', panel: 'result' },
  { label: 'Shape', panel: 'mapping' },
];
const STAGES_COMPILE: StageDef[] = [
  { label: 'Intent' },
  { label: 'Resolve', panel: 'dsl' },
  { label: 'Analyze', panel: 'error' },
  { label: 'Compile SQL', panel: 'sql' },
];

const stageDefs = (scenario: VexScenario): StageDef[] =>
  scenario.mode === 'compile' ? STAGES_COMPILE : STAGES_EXECUTE;

// Map an event to how many stages should now be "reached" (the chase
// target). Indices follow STAGES_EXECUTE.
const eventTarget = (e: VexEvent): number | undefined => {
  switch (e.type) {
    case 'query.start': return 1;   // Intent done, Cache active
    case 'query.cache': return 2;   // Cache done, Generate active
    case 'query.dsl': return 3;     // Generate done (fires only on a miss)
    case 'query.sql': return 6;     // Scope + Analyze + Compile done
    case 'query.rows': return 7;    // Execute done
    case 'query.mapped': return 8;  // Shape done
    case 'query.done': return 8;
    default: return undefined;
  }
};

const applyEvent = (f: Facts, e: VexEvent): Facts => {
  switch (e.type) {
    case 'query.cache': return { ...f, cacheHit: e.hit };
    case 'query.dsl': return { ...f, agentMs: e.agentMs };
    case 'query.sql': return { ...f, warnings: e.warnings };
    case 'query.rows': return { ...f, rowCount: e.count, executionMs: e.executionMs };
    case 'query.mapped': return { ...f, mappingMs: e.mappingMs };
    case 'query.done': return { ...f, totalMs: e.totalMs };
    default: return f;
  }
};

// Per-stage detail text + final (passed-frontier) status, sourced from
// live facts so it's correct mid-run.
const stageInfo = (scenario: VexScenario, label: string, f: Facts): { detail: string; status: StageStatus } => {
  if (scenario.mode === 'compile') {
    switch (label) {
      case 'Intent': return { detail: 'parsed', status: 'done' };
      case 'Resolve': return { detail: 'columns + joins', status: 'done' };
      case 'Analyze': return f.error !== undefined ? { detail: 'rejected', status: 'error' } : { detail: 'passed', status: 'done' };
      case 'Compile SQL': return f.error !== undefined ? { detail: 'never reached', status: 'skipped' } : { detail: 'compiled', status: 'done' };
    }
  }
  switch (label) {
    case 'Intent': return { detail: 'parsed', status: 'done' };
    case 'Cache':
      return { detail: f.cacheHit === undefined ? 'checking…' : f.cacheHit ? 'HIT' : 'MISS', status: 'done' };
    case 'Generate':
      if (f.cacheHit) return { detail: 'reused · 0 LLM', status: 'skipped' };
      if (f.live) return { detail: f.agentMs !== undefined ? `LLM ${ms(f.agentMs)}` : 'generating…', status: 'done' };
      return { detail: 'DSL supplied', status: 'done' };
    case 'Scope':
      return f.scoped ? { detail: '+1 filter', status: 'done' } : { detail: 'none', status: 'skipped' };
    case 'Analyze':
      return (f.warnings?.length ?? 0) > 0 ? { detail: `${f.warnings!.length} warning`, status: 'warn' } : { detail: 'passed', status: 'done' };
    case 'Compile SQL':
      return { detail: 'parameterized', status: 'done' };
    case 'Execute':
      return { detail: f.rowCount !== undefined ? `${f.rowCount} rows · ${ms(f.executionMs)}` : 'running…', status: 'done' };
    case 'Shape':
      return f.reshape ? { detail: `mapped · ${ms(f.mappingMs)}`, status: 'done' } : { detail: 'shape matches', status: 'skipped' };
  }
  return { detail: '', status: 'done' };
};

const STATUS_COLOR: Record<StageStatus, { fg: string; bg: string; border: string }> = {
  done: { fg: C.green, bg: C.greenBg, border: '#a7f3d0' },
  active: { fg: C.amber, bg: C.amberBg, border: '#fde68a' },
  warn: { fg: C.amber, bg: C.amberBg, border: '#fde68a' },
  error: { fg: C.red, bg: C.redBg, border: '#fecaca' },
  skipped: { fg: C.muted, bg: '#f3f4f6', border: C.border },
  idle: { fg: '#9ca3af', bg: '#fff', border: C.border },
};

// ─── Panels ──────────────────────────────────────────────────

const Panel: FC<{ id?: string; title: string; focused?: boolean; right?: ReactNode; children: ReactNode }> = ({ id, title, focused, right, children }) => (
  <div id={id} style={{ animation: 'vexPop 0.28s ease both', border: focused ? `1px solid ${C.accent}` : '1px solid transparent', borderRadius: 8, padding: focused ? 8 : 0, transition: 'border-color 0.2s' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: C.muted }}>{title}</div>
      {right}
    </div>
    {children}
  </div>
);

const Code: FC<{ children: string; variant?: 'normal' | 'error' }> = ({ children, variant = 'normal' }) => (
  <pre style={{ margin: 0, padding: 12, background: variant === 'error' ? C.redBg : C.panel, color: variant === 'error' ? C.red : C.text, border: `1px solid ${variant === 'error' ? '#fecaca' : C.border}`, borderRadius: 6, fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'auto', maxHeight: 300 }}>{children}</pre>
);

const RowsTable: FC<{ rows: unknown[] }> = ({ rows }) => {
  if (rows.length === 0) return <Code>(no rows)</Code>;
  const first = rows[0];
  if (first === null || typeof first !== 'object') return <Code>{JSON.stringify(rows, null, 2)}</Code>;
  const cols = Object.keys(first as Record<string, unknown>);
  const fmt = (v: unknown): string => (v === null ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return (
    <div style={{ overflow: 'auto', border: `1px solid ${C.border}`, borderRadius: 6 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
        <thead><tr>{cols.map((c) => (<th key={c} style={{ textAlign: 'left', padding: '6px 10px', background: C.panel, borderBottom: `1px solid ${C.border}`, color: C.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>{c}</th>))}</tr></thead>
        <tbody>
          {(rows as Record<string, unknown>[]).slice(0, 50).map((row, i) => (
            <tr key={i}>{cols.map((c) => (<td key={c} style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontFamily: 'ui-monospace, Menlo, monospace', whiteSpace: 'nowrap' }}>{fmt(row[c])}</td>))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const CacheBadge: FC<{ outcome: RunOutcome }> = ({ outcome }) => {
  const hit = outcome.cacheHit;
  const c = hit ? STATUS_COLOR.done : STATUS_COLOR.active;
  const label = hit ? 'CACHE HIT · DSL reused · 0 LLM calls' : outcome.live ? `GENERATED LIVE · ${ms(outcome.timing.agentMs)}` : 'DSL CACHED · zero LLM';
  return <span style={{ fontSize: 11, fontWeight: 700, color: c.fg, background: c.bg, border: `1px solid ${c.border}`, padding: '3px 8px', borderRadius: 999, animation: 'vexPop 0.3s ease both' }}>{label}</span>;
};

const scopeClauseText = (dsl: Query, scopeKey: string): string | undefined => {
  for (const src of dsl.from) {
    if (typeof src !== 'string') continue;
    const rule = scopePolicy.entities[src];
    if (rule && 'field' in rule && rule.source === scopeKey) return `${src}.${rule.field} ${rule.op ?? 'eq'} $scope.${scopeKey}`;
  }
  return undefined;
};

const Select: FC<{ label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; disabled?: boolean }> = ({ label, value, options, onChange, disabled }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: C.muted, fontWeight: 600 }}>{label}</span>
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', fontSize: 13, color: C.text }}>
      {options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  </label>
);

// ─── Stage strip ─────────────────────────────────────────────

const StageStrip: FC<{ scenario: VexScenario; facts: Facts; frontier: number; finished: boolean; errored: boolean; focused: string | undefined; started: boolean; onPick: (panel: string | undefined) => void }> = ({ scenario, facts, frontier, finished, errored, focused, started, onPick }) => {
  const defs = stageDefs(scenario);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'stretch' }}>
      {defs.map((d, i) => {
        const reached = i < frontier;
        const isFrontier = i === frontier && !finished && started;
        const isError = errored && finished && i === frontier; // the stage the run died on
        const info = stageInfo(scenario, d.label, facts);
        const status: StageStatus = !started ? 'idle' : isError ? 'error' : isFrontier ? 'active' : reached ? info.status : 'idle';
        const col = STATUS_COLOR[status];
        const clickable = (reached || isError) && (isError ? true : d.panel !== undefined);
        const panel = isError ? 'error' : d.panel;
        const isFocused = focused !== undefined && panel === focused;
        const passed = i < frontier - 1;
        const detail = isError ? 'failed' : reached || isFrontier ? info.detail : '';
        return (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" disabled={!clickable} onClick={() => onPick(isFocused ? undefined : panel)} style={{ minWidth: 96, textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: `1px solid ${isFocused ? C.accent : col.border}`, background: col.bg, color: col.fg, cursor: clickable ? 'pointer' : 'default', animation: isFrontier ? 'vexPulse 1s ease-in-out infinite' : reached || isError ? 'vexPop 0.25s ease both' : undefined, opacity: started && (reached || isFrontier || isError) ? 1 : 0.5, transition: 'opacity 0.2s' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}>{d.label}</div>
              <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85, minHeight: 14 }}>{detail}</div>
            </button>
            {i < defs.length - 1 && (<span style={{ color: passed ? C.accent : '#cbd5e1', fontSize: 14, transition: 'color 0.2s' }}>→</span>)}
          </div>
        );
      })}
    </div>
  );
};

// ─── Main ────────────────────────────────────────────────────

const initialContext = (s: VexScenario): Record<string, unknown> => ({ ...(s.context ?? {}) });
const initialScope = (s: VexScenario): Record<string, unknown> => ({ ...(s.scope ?? {}) });

export const VexView: FC<{ scenario: VexScenario }> = ({ scenario }) => {
  const boot = useVexBoot();
  const setRunView = useVexRunSetter();

  const [context, setContext] = useState<Record<string, unknown>>(() => initialContext(scenario));
  const [scope, setScope] = useState<Record<string, unknown>>(() => initialScope(scenario));
  const [live, setLive] = useState(false);
  const [outcome, setOutcome] = useState<RunOutcome | undefined>(undefined);
  const [facts, setFacts] = useState<Facts>({ scoped: false, reshape: false, live: false });
  const [frontier, setFrontier] = useState(0);
  const [finished, setFinished] = useState(false);
  const [started, setStarted] = useState(false);
  const [running, setRunning] = useState(false);
  const [focused, setFocused] = useState<string | undefined>(undefined);
  // getLiveConfig already returns a corrected, usable config (provider
  // with a key, model in presets), so the UI and live.ts stay in sync.
  const [liveProvider, setLiveProvider] = useState<RecipeProvider>(() => getLiveConfig().provider);
  const [liveModel, setLiveModel] = useState<string>(() => getLiveConfig().model);
  const runSeq = useRef(0);
  const targetRef = useRef(0);

  const keyAvailable = hasGenerationKey();
  const providers = availableProviders();

  const pickProvider = (p: RecipeProvider): void => {
    const model = PROVIDER_MODELS[p][0]!;
    setLiveProvider(p);
    setLiveModel(model);
    setLiveConfig({ provider: p, model });
  };
  const pickModel = (m: string): void => {
    setLiveModel(m);
    setLiveConfig({ provider: liveProvider, model: m });
  };

  useEffect(() => {
    runSeq.current += 1; // cancel any in-flight run/animation
    setContext(initialContext(scenario));
    setScope(initialScope(scenario));
    setLive(false);
    setOutcome(undefined);
    setFacts({ scoped: false, reshape: false, live: false });
    setFrontier(0);
    setFinished(false);
    setStarted(false);
    setRunning(false);
    setFocused(undefined);
  }, [scenario]);

  const run = useCallback(async () => {
    if (boot.status !== 'ready' || running) return;
    const seq = ++runSeq.current;
    const defs = stageDefs(scenario);
    const stageCount = defs.length;
    const isLive = live && keyAvailable && scenario.mode === 'execute';

    // Reset + arm.
    setRunning(true);
    setStarted(true);
    setFinished(false);
    setFocused(undefined);
    setOutcome(undefined);
    setFrontier(0);
    targetRef.current = 0;
    let displayed = 0;
    const baseFacts: Facts = { scoped: scenario.scopeKey !== undefined, reshape: scenario.mapping !== undefined, live: isLive };
    setFacts(baseFacts);

    let resolved = false;

    // Chase loop: advance the displayed frontier toward the event-driven
    // target at a capped rate, so fast (canned) runs still sweep and slow
    // (live) runs pause on the in-progress stage.
    const chase = async (): Promise<void> => {
      for (;;) {
        if (seq !== runSeq.current) return;
        if (displayed < targetRef.current) {
          displayed += 1;
          setFrontier(displayed);
          await delay(DWELL);
        } else if (resolved && displayed >= targetRef.current) {
          return; // caught up to where the run actually got
        } else {
          await delay(40); // idle: waiting for the next event
        }
      }
    };
    const chasePromise = chase();

    // Execute mode advances from real events; compile mode has none, so
    // we drive the (instant) target straight to the end.
    startRecording();
    const result = await runScenario(boot.runtime, scenario, {
      context,
      scope: scenario.scopeKey !== undefined ? scope : undefined,
      live: isLive,
      onEvent: (e) => {
        if (seq !== runSeq.current) return;
        setFacts((f) => applyEvent(f, e));
        const t = eventTarget(e);
        if (t !== undefined && t > targetRef.current) targetRef.current = t;
      },
    });
    const transcript = stopRecording();
    if (result.error !== undefined) {
      console.groupCollapsed(`[vex] "${scenario.id}" failed: ${result.error}`);
      console.log('DSL used:', result.dsl);
      transcript.forEach((x) => {
        console.groupCollapsed(`#${x.iteration} ${x.label} · ${x.finishReason} · ${x.tokens}tok · ${x.ms}ms · tools:[${x.tools.join(',')}]`);
        console.log('toolCalls:', x.toolCalls);
        console.log('responseContent:', x.responseContent);
        if (x.finishReason === 'error_recovered') console.log('RAW provider error (swallowed by Signal):', x.raw);
        console.log('sentMessages:', x.sentMessages);
        console.groupEnd();
      });
      console.groupEnd();
    }
    if (seq !== runSeq.current) return;

    setOutcome(result);
    setFacts((f) => ({
      ...f,
      cacheHit: result.cacheHit,
      live: result.live,
      error: result.error,
      warnings: result.warnings,
      rowCount: result.rows.length,
      ...result.timing,
    }));
    resolved = true;
    // On success (or a compile-mode rejection, whose error is the point)
    // sweep through every stage. On an execute-mode error, stop where the
    // run actually got — the next stage is rendered as the failure.
    if (result.error === undefined || scenario.mode === 'compile') {
      targetRef.current = stageCount;
    }
    await chasePromise;
    if (seq !== runSeq.current) return;

    setFinished(true);
    setRunning(false);
    setRunView({
      scenarioId: scenario.id,
      intent: scenario.intent,
      shape: scenario.shape,
      context,
      dsl: result.dsl,
      sql: result.sql,
      rows: result.rows,
      warnings: result.warnings,
      cacheHit: result.cacheHit,
      cacheKey: result.cacheKey,
      scopeClause: scenario.scopeKey ? scopeClauseText(result.dsl, scenario.scopeKey) : undefined,
      timing: result.timing,
      error: result.error,
      transcript,
    });
  }, [boot, scenario, context, scope, live, keyAvailable, running, setRunView]);

  if (boot.status === 'booting') return <Centered>Booting Postgres (WASM) + seeding data…</Centered>;
  if (boot.status === 'error') return <Centered><span style={{ color: C.red }}>Boot failed: {boot.error}</span></Centered>;

  const panelReached = (panel: string): boolean => {
    const defs = stageDefs(scenario);
    const idx = defs.findIndex((s) => s.panel === panel);
    return idx >= 0 && idx < frontier;
  };
  const scopeClause = outcome?.ok && scenario.scopeKey ? scopeClauseText(outcome.dsl, scenario.scopeKey) : undefined;

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <style>{KEYFRAMES}</style>

      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Intent</div>
          <div style={{ fontSize: 15, color: C.text, fontStyle: 'italic' }}>“{scenario.intent}”</div>
        </div>
        {(scenario.editable ?? []).map((e) => (
          <Select key={e.key} label={e.label} value={String(context[e.key] ?? e.options[0])} options={e.options.map((v) => ({ value: v, label: v }))} onChange={(v) => setContext((prev) => ({ ...prev, [e.key]: v }))} />
        ))}
        {scenario.scopeKey !== undefined && (
          <Select label="Scope" value={String(scope[scenario.scopeKey] ?? ACCOUNTS[0])} options={ACCOUNTS.map((a) => ({ value: a, label: ACCOUNT_LABEL(a) }))} onChange={(v) => setScope((prev) => ({ ...prev, [scenario.scopeKey as string]: v }))} />
        )}
        {scenario.mode === 'execute' && (
          <Select label="Mode" value={live ? 'live' : 'canned'} disabled={!keyAvailable} options={[{ value: 'canned', label: 'Canned (no key)' }, { value: 'live', label: keyAvailable ? 'Live (LLM)' : 'Live (needs key)' }]} onChange={(v) => setLive(v === 'live')} />
        )}
        {scenario.mode === 'execute' && live && keyAvailable && (
          <>
            <Select label="Provider" value={liveProvider} options={providers.map((p) => ({ value: p, label: p }))} onChange={(v) => pickProvider(v as RecipeProvider)} />
            <Select label="Model" value={liveModel} options={PROVIDER_MODELS[liveProvider].map((m) => ({ value: m, label: m }))} onChange={pickModel} />
          </>
        )}
        <button onClick={() => void run()} disabled={running} style={{ padding: '8px 22px', borderRadius: 6, border: 'none', background: running ? '#a5b4fc' : C.accent, color: '#fff', fontSize: 14, fontWeight: 700, cursor: running ? 'wait' : 'pointer', alignSelf: 'flex-end' }}>{running ? 'Running…' : '▶ Run'}</button>
      </div>

      {/* Pipeline */}
      <Panel title="Pipeline" right={finished && outcome?.ok ? <CacheBadge outcome={outcome} /> : undefined}>
        <StageStrip scenario={scenario} facts={facts} frontier={frontier} finished={finished} errored={finished && outcome?.error !== undefined && scenario.mode !== 'compile'} focused={focused} started={started} onPick={setFocused} />
        {!started && (
          <div style={{ fontSize: 13, color: C.muted, marginTop: 12 }}>Press <strong>Run</strong> to execute the pipeline against the in-browser Postgres. Stages light up live as data flows; click any stage to focus its output.</div>
        )}
      </Panel>

      {/* Artifacts — revealed as their stage is reached */}
      {panelReached('dsl') && (
        <Panel id="p-dsl" title="Generated DSL" focused={focused === 'dsl'}>
          <Code>{JSON.stringify(outcome?.dsl ?? scenario.dsl, null, 2)}</Code>
        </Panel>
      )}

      {panelReached('scope') && scopeClause !== undefined && (
        <Panel id="p-scope" title="Scope — injected server-side (LLM never sees it)" focused={focused === 'scope'}>
          <Code>{`AND ${scopeClause}\n   → ${scenario.scopeKey} = ${accountLabelMaybe(String(scope[scenario.scopeKey as string]))}`}</Code>
        </Panel>
      )}

      {outcome?.error !== undefined && finished ? (
        <Panel id="p-error" title={scenario.mode === 'compile' ? 'Analyzer — rejected before SQL' : 'Error'} focused={focused === 'error'}>
          <Code variant="error">{outcome.error}</Code>
        </Panel>
      ) : (
        <>
          {panelReached('warn') && outcome !== undefined && outcome.warnings.length > 0 && (
            <Panel id="p-warn" title="Analyzer warnings" focused={focused === 'warn'}>
              <Code variant="error">{outcome.warnings.join('\n')}</Code>
            </Panel>
          )}
          {panelReached('sql') && outcome?.sql !== undefined && (
            <Panel id="p-sql" title="Compiled SQL (parameterized)" focused={focused === 'sql'}>
              <Code>{outcome.sql}</Code>
            </Panel>
          )}
          {panelReached('mapping') && scenario.mode === 'execute' && (
            <Panel id="p-mapping" title="Map to shape (Prism)" focused={focused === 'mapping'}>
              {scenario.mapping !== undefined ? (
                <Code>{JSON.stringify(scenario.mapping, null, 2)}</Code>
              ) : (
                <div style={{ fontSize: 12, color: C.muted }}>Rows already match the requested shape — an identity transform passes them through. No LLM, no reshaping.</div>
              )}
            </Panel>
          )}
          {panelReached('result') && scenario.mode === 'execute' && outcome !== undefined && (
            <Panel id="p-result" title="Result" focused={focused === 'result'} right={<span style={{ fontSize: 11, color: C.muted }}>{outcome.rows.length} rows · {ms(outcome.timing.totalMs)}</span>}>
              <RowsTable rows={outcome.rows} />
            </Panel>
          )}
        </>
      )}

      {scenario.note !== undefined && (
        <div style={{ fontSize: 12, color: C.muted, borderLeft: `3px solid ${C.border}`, paddingLeft: 10 }}>{scenario.note}</div>
      )}
    </div>
  );
};

const Centered: FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 14 }}>{children}</div>
);
