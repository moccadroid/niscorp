import { useCallback, useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { Btn, Callout, Chip, Grid, INK, Panel, type Tone } from '@showroom/chrome/stage/ui';
import { useVexBoot, useVexRunSetter } from './runtime-context';
import { runScenario, type RunOutcome } from './run';
import { scopePolicy, mutationPolicy } from './runtime/scope';
import { hasGenerationKey } from './runtime/live';
import { availableProviders, getLiveConfig, setLiveConfig, PROVIDER_MODELS } from './runtime/live-config';
import { startRecording, stopRecording } from './runtime/live-debug';
import { ACCOUNTS } from './runtime/seed-data';
import { AnswerPhone, Block, prettySql, json } from './parts';
import type { RecipeProvider } from '@showroom/modules/signal/openai-client';
import type { VexScenario } from './scenarios';
import type { Query, ScopeRule, VexEvent } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════
// VexView — the showroom canvas for a Vex scenario. Runs the real
// engine against PGlite ONLY when Run is pressed, and advances the
// pipeline from the LIVE event stream: Intent/Cache light up the
// instant they happen, Generate pulses while the LLM works, and each
// artifact panel pops in as its stage completes. A displayed
// "frontier" chases the event-driven target at a capped rate so even
// the (instant) stored-entry path sweeps through visibly.
//
// Real: the engine, the compiler, Postgres (PGlite), the cache, the
// handler. Authored: each story's DSL — with no model key it stands in
// for what a model would have written, and the stage labels say so.
// ═══════════════════════════════════════════════════════════

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
  // Was the stored DSL found under the story's name? For a live run this
  // comes off the engine's own cache event; for a stored-entry run it is
  // known once the run returns.
  cacheHit?: boolean;
  // This stored-entry run found the slot empty and filled it with the
  // story's hand-written DSL before replaying it. No model was involved.
  seeded?: boolean;
  agentMs?: number;
  warnings?: string[];
  rowCount?: number;
  executionMs?: number;
  mappingMs?: number;
  totalMs?: number;
  error?: string;
  errorCode?: string; // wire error code ('mutate' refusals) — picks the failed stage
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
// The write pipeline: replay the seeded definition → satisfy its derived
// context signature → pass the write phases → execute with RETURNING.
const STAGES_MUTATE: StageDef[] = [
  { label: 'Intent' },
  { label: 'Replay', panel: 'mutation' },
  { label: 'Context' },
  { label: 'Scope', panel: 'scope' },
  { label: 'Execute', panel: 'result' },
];

const stageDefs = (scenario: VexScenario): StageDef[] =>
  scenario.mode === 'compile' ? STAGES_COMPILE : scenario.mode === 'mutate' ? STAGES_MUTATE : STAGES_EXECUTE;

// Which mutate stage a wire refusal belongs to — everything after it was
// never reached.
const MUTATE_FAIL_STAGE: Record<string, string> = {
  invalid_request: 'Replay',
  missing_context: 'Context',
  scope_denied: 'Scope',
};
const MUTATE_FAIL_DETAIL: Record<string, string> = {
  Replay: 'not a request shape',
  Context: 'hole — refused',
  Scope: 'no phase — denied',
  Execute: 'failed',
};

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
    // A stored-entry run always replays a warm slot (it fills an empty one
    // first), so the engine's own verdict would say "hit" even on the run
    // that filled it. Only a live run's verdict says something here.
    case 'query.cache': return f.live ? { ...f, cacheHit: e.hit } : f;
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
  if (scenario.mode === 'mutate') {
    const failedAt = f.error !== undefined ? (MUTATE_FAIL_STAGE[f.errorCode ?? ''] ?? 'Execute') : undefined;
    if (failedAt !== undefined) {
      const order = STAGES_MUTATE.map((s) => s.label);
      const fi = order.indexOf(failedAt);
      const li = order.indexOf(label);
      if (li > fi) return { detail: 'never reached', status: 'skipped' };
      if (li === fi) return { detail: MUTATE_FAIL_DETAIL[label] ?? 'failed', status: 'error' };
    }
    switch (label) {
      case 'Intent': return { detail: 'parsed', status: 'done' };
      case 'Replay': return { detail: 'stored write · never generated', status: 'done' };
      case 'Context': return { detail: 'every value present', status: 'done' };
      case 'Scope': return f.scoped ? { detail: 'stamp + pin', status: 'done' } : { detail: 'phase granted', status: 'done' };
      case 'Execute': return { detail: f.rowCount !== undefined ? `${f.rowCount} row${f.rowCount === 1 ? '' : 's'} · ${ms(f.executionMs)}` : 'running…', status: 'done' };
    }
  }
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
      if (f.live) return f.cacheHit === undefined ? { detail: 'looking…', status: 'done' } : { detail: 'empty · must generate', status: 'done' };
      if (f.seeded === true) return { detail: 'empty · story’s DSL stored', status: 'done' };
      if (f.cacheHit === true) return { detail: 'found · reused', status: 'done' };
      return { detail: 'looking…', status: 'done' };
    case 'Generate':
      if (f.live) return { detail: f.agentMs !== undefined ? `model · ${ms(f.agentMs)}` : 'model writing…', status: 'done' };
      if (f.seeded === true) return { detail: 'no model · hand-written', status: 'skipped' };
      return { detail: 'not needed · no model', status: 'skipped' };
    case 'Scope':
      return f.scoped ? { detail: '+1 filter', status: 'done' } : { detail: 'none', status: 'skipped' };
    case 'Analyze':
      return (f.warnings?.length ?? 0) > 0 ? { detail: `${f.warnings?.length ?? 0} warning`, status: 'warn' } : { detail: 'passed', status: 'done' };
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
  done: { fg: INK.ok, bg: INK.okWash, border: '#a7f3d0' },
  active: { fg: INK.accent, bg: INK.accentWash, border: '#c7d2fe' },
  warn: { fg: INK.warn, bg: INK.warnWash, border: '#fde68a' },
  error: { fg: INK.bad, bg: INK.badWash, border: '#fecaca' },
  skipped: { fg: INK.soft, bg: INK.wash, border: INK.line },
  idle: { fg: INK.faint, bg: '#fff', border: INK.line },
};

// ─── What happened, in one line ──────────────────────────────
// Where the DSL came from on this run. Three honest answers for a read:
// a model wrote it just now, the story's hand-written DSL was stored and
// replayed (first run), or the stored DSL was found and replayed.

const verdictOf = (outcome: RunOutcome, mode: VexScenario['mode']): { tone: Tone; text: string } => {
  if (mode === 'mutate') {
    return outcome.cacheHit
      ? { tone: 'ok', text: 'Replayed the stored write · no model' }
      : { tone: 'ok', text: 'Write stored, then replayed · writes are never generated' };
  }
  if (outcome.live) return { tone: 'warn', text: `Written by a model just now · ${ms(outcome.timing.agentMs)}` };
  if (outcome.cacheHit) return { tone: 'ok', text: 'Replayed the stored DSL · no model call' };
  return { tone: 'accent', text: 'First run: the story’s DSL stored, then replayed · no model call' };
};

const dslAside = (outcome: RunOutcome | undefined): ReactNode => {
  if (outcome === undefined) return undefined;
  if (outcome.live) return <Chip tone="warn">written by a model</Chip>;
  return <Chip>written by hand for this story</Chip>;
};

// ─── Panels ──────────────────────────────────────────────────

// A stage panel that pops in when its stage is reached, and rings when
// its stage chip is clicked.
const Artifact: FC<{ id?: string; title: ReactNode; focused?: boolean; aside?: ReactNode; tone?: 'plain' | 'ok' | 'bad'; children: ReactNode }> = ({
  id,
  title,
  focused,
  aside,
  tone,
  children,
}) => (
  <div id={id} style={{ animation: 'vexPop 0.28s ease both', minWidth: 0 }}>
    <Panel title={title} aside={aside} tone={tone} style={focused === true ? { boxShadow: `0 0 0 2px ${INK.accent}` } : undefined}>
      {children}
    </Panel>
  </div>
);

const RowsTable: FC<{ rows: unknown[] }> = ({ rows }) => {
  if (rows.length === 0) return <Block>(no rows)</Block>;
  const first = rows[0];
  if (first === null || typeof first !== 'object' || Array.isArray(first)) return <Block>{json(rows)}</Block>;
  const cols = Object.keys(first);
  const fmt = (v: unknown): string => (v === null ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  const cellOf = (row: unknown, c: string): unknown => (row !== null && typeof row === 'object' ? Reflect.get(row, c) : undefined);
  return (
    <div style={{ overflow: 'auto', border: `1px solid ${INK.line}`, borderRadius: 10, maxHeight: 420 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} style={{ textAlign: 'left', padding: '7px 10px', background: INK.wash, borderBottom: `1px solid ${INK.line}`, color: INK.soft, fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5 }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} style={{ padding: '6px 10px', borderBottom: `1px solid ${INK.wash}`, fontFamily: 'ui-monospace, Menlo, monospace', whiteSpace: 'nowrap', color: INK.text }}>
                  {fmt(cellOf(row, c))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const scopeClauseText = (dsl: Query | undefined, scopeKey: string): string | undefined => {
  if (dsl === undefined) return undefined;
  for (const src of dsl.from) {
    if (typeof src !== 'string') continue;
    const rule = scopePolicy.entities[src];
    if (rule && 'read' in rule) {
      const m = rule.read?.find((r) => ('to' in r ? r.to : r.in) === scopeKey);
      if (m) return 'to' in m ? `${src}.${m.match} = $scope.${scopeKey}` : `${src}.${m.match} = ANY($scope.${scopeKey})`;
    }
  }
  return undefined;
};

// The write phases for the mutated table — rendered from the SAME policy
// object the handler enforces, so the panel can't drift from the truth.
const writeRulesText = (scenario: VexScenario): string => {
  const m = scenario.mutation;
  if (m === undefined || Array.isArray(m)) return '';
  const rule = mutationPolicy.entities[m.table];
  const lines: string[] = [`table: ${m.table} · op: ${m.op} · default: ${mutationPolicy.default}`];
  if (rule === undefined || 'deny' in rule || 'public' in rule) {
    lines.push(`entity rule: ${JSON.stringify(rule ?? '(unlisted)')}`);
    return lines.join('\n');
  }
  const fmt = (rules: readonly ScopeRule[] | undefined): string =>
    rules === undefined
      ? 'ABSENT — no phase, no verb'
      : rules.length === 0
        ? 'granted (no row rules)'
        : rules.map((r) => ('set' in r ? `set ${r.set} ← $scope.${r.to}` : 'to' in r ? `match ${r.match} = $scope.${r.to}` : `match ${r.match} = ANY($scope.${r.in})`)).join('  +  ');
  if (rule.write !== undefined) lines.push(`write (umbrella): ${fmt(rule.write)}`);
  else {
    lines.push(`insert: ${fmt(rule.insert)}`);
    lines.push(`update: ${fmt(rule.update)}`);
    lines.push(`delete: ${fmt(rule.delete)}`);
  }
  return lines.join('\n');
};

const Select: FC<{ label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; disabled?: boolean; title?: string }> = ({
  label,
  value,
  options,
  onChange,
  disabled,
  title,
}) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }} title={title}>
    <span style={{ fontSize: 12, color: INK.soft, fontWeight: 600 }}>{label}</span>
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{ font: 'inherit', padding: '6px 8px', borderRadius: 9, border: `1px solid ${INK.line}`, background: '#fff', fontSize: 13, color: INK.text, cursor: disabled === true ? 'not-allowed' : 'pointer' }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

const isProvider = (v: string): v is RecipeProvider => v === 'groq' || v === 'openrouter' || v === 'openai';

// ─── Stage strip ─────────────────────────────────────────────

const StageStrip: FC<{ scenario: VexScenario; facts: Facts; frontier: number; finished: boolean; errored: boolean; focused: string | undefined; started: boolean; onPick: (panel: string | undefined) => void }> = ({
  scenario,
  facts,
  frontier,
  finished,
  errored,
  focused,
  started,
  onPick,
}) => {
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
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onPick(isFocused ? undefined : panel)}
              style={{
                font: 'inherit',
                minWidth: 104,
                textAlign: 'left',
                padding: '8px 11px',
                borderRadius: 10,
                border: `1px solid ${isFocused ? INK.accent : col.border}`,
                background: col.bg,
                color: col.fg,
                cursor: clickable ? 'pointer' : 'default',
                animation: isFrontier ? 'vexPulse 1s ease-in-out infinite' : reached || isError ? 'vexPop 0.25s ease both' : undefined,
                opacity: started && (reached || isFrontier || isError) ? 1 : 0.55,
                transition: 'opacity 0.2s',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700 }}>{d.label}</div>
              <div style={{ fontSize: 11, marginTop: 2, opacity: 0.9, minHeight: 14 }}>{detail}</div>
            </button>
            {i < defs.length - 1 && <span style={{ color: passed ? INK.accent : '#cbd5e1', fontSize: 14, transition: 'color 0.2s' }}>→</span>}
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
    const model = PROVIDER_MODELS[p][0] ?? '';
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
    // target at a capped rate, so fast (stored-entry) runs still sweep and
    // slow (live) runs pause on the in-progress stage.
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
      seeded: !result.live && result.generated,
      live: result.live,
      error: result.error,
      errorCode: result.errorCode,
      warnings: result.warnings,
      rowCount: result.rows.length,
      ...result.timing,
    }));
    resolved = true;
    // On success (or a compile/mutate rejection, whose error IS the point —
    // stageInfo marks the stage the wire refused at) sweep through every
    // stage. On an execute-mode error, stop where the run actually got.
    if (result.error === undefined || scenario.mode !== 'execute') {
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
      live: result.live,
      fingerprint: result.fingerprint,
      scopeClause: scenario.scopeKey ? scopeClauseText(result.dsl, scenario.scopeKey) : undefined,
      timing: result.timing,
      error: result.error,
      transcript,
    });
  }, [boot, scenario, context, scope, live, keyAvailable, running, setRunView]);

  if (boot.status === 'booting') return <Centered>Starting Postgres in this page and loading the shop’s data…</Centered>;
  if (boot.status === 'error')
    return (
      <div style={{ padding: 24 }}>
        <Callout tone="bad" title="Postgres did not start">
          {boot.error}
        </Callout>
      </div>
    );

  const panelReached = (panel: string): boolean => {
    const defs = stageDefs(scenario);
    const idx = defs.findIndex((s) => s.panel === panel);
    return idx >= 0 && idx < frontier;
  };
  const scopeClause = outcome?.ok === true && scenario.scopeKey !== undefined ? scopeClauseText(outcome.dsl, scenario.scopeKey) : undefined;
  const verdict = finished && outcome?.ok === true ? verdictOf(outcome, scenario.mode) : undefined;
  const scopeKey = scenario.scopeKey;

  return (
    <div style={{ padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16, color: INK.text }}>
      <style>{KEYFRAMES}</style>

      {/* The ask, and what to change before running it */}
      <Panel
        title="The ask"
        aside={
          scenario.mode === 'mutate' ? (
            <Chip>a stored write · replay only</Chip>
          ) : scenario.mode === 'compile' ? (
            <Chip>compiled only · never run</Chip>
          ) : live && keyAvailable ? (
            <Chip tone="warn">a model writes the DSL</Chip>
          ) : (
            <Chip>the story’s DSL · no model</Chip>
          )
        }
      >
        <div style={{ fontSize: 16, fontStyle: 'italic', lineHeight: 1.45 }}>“{scenario.intent}”</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
          {(scenario.editable ?? []).map((e) => (
            <Select
              key={e.key}
              label={e.label}
              value={String(context[e.key] ?? e.options[0])}
              options={e.options.map((v) => ({ value: v, label: v }))}
              onChange={(v) => setContext((prev) => ({ ...prev, [e.key]: v }))}
            />
          ))}
          {scopeKey !== undefined && (
            <Select
              label="Asking as"
              value={String(scope[scopeKey] ?? ACCOUNTS[0])}
              options={ACCOUNTS.map((a) => ({ value: a, label: ACCOUNT_LABEL(a) }))}
              onChange={(v) => setScope((prev) => ({ ...prev, [scopeKey]: v }))}
            />
          )}
          {scenario.mode === 'execute' && (
            <Select
              label="Who writes the DSL"
              value={live ? 'live' : 'canned'}
              disabled={!keyAvailable}
              title={keyAvailable ? undefined : 'Asking a model needs a key — set one in Signal → Settings'}
              options={[
                { value: 'canned', label: 'Nobody — replay the story’s DSL' },
                { value: 'live', label: keyAvailable ? 'A model, now' : 'A model (needs a key)' },
              ]}
              onChange={(v) => setLive(v === 'live')}
            />
          )}
          {scenario.mode === 'execute' && live && keyAvailable && (
            <>
              <Select label="Provider" value={liveProvider} options={providers.map((p) => ({ value: p, label: p }))} onChange={(v) => { if (isProvider(v)) pickProvider(v); }} />
              <Select label="Model" value={liveModel} options={PROVIDER_MODELS[liveProvider].map((m) => ({ value: m, label: m }))} onChange={pickModel} />
            </>
          )}
          <Btn kind="primary" onClick={() => void run()} disabled={running}>
            {running ? 'Running…' : started ? '▶ Run again' : '▶ Run'}
          </Btn>
        </div>
      </Panel>

      {/* Pipeline */}
      <Panel title="What happened" aside={verdict !== undefined ? <Chip tone={verdict.tone}>{verdict.text}</Chip> : undefined}>
        <StageStrip
          scenario={scenario}
          facts={facts}
          frontier={frontier}
          finished={finished}
          errored={finished && outcome?.error !== undefined && scenario.mode === 'execute'}
          focused={focused}
          started={started}
          onPick={setFocused}
        />
        {!started && (
          <div style={{ fontSize: 13, color: INK.soft, lineHeight: 1.55 }}>
            Press <b>Run</b> to send this through the real engine, against Postgres running in this page. Each stage lights up as the engine reaches it;
            click a lit stage to find what it produced.
          </div>
        )}
      </Panel>

      {/* Artifacts — revealed as their stage is reached */}
      <Grid min={360} gap={16}>
        {panelReached('dsl') && (
          <Artifact id="p-dsl" title="The DSL — the query, as JSON" aside={dslAside(outcome)} focused={focused === 'dsl'}>
            <Block>{json(outcome?.dsl ?? scenario.dsl)}</Block>
          </Artifact>
        )}

        {panelReached('mutation') && scenario.mode === 'mutate' && (
          <Artifact
            id="p-mutation"
            title={scenario.mutation !== undefined ? 'The stored write' : 'What was sent — not a request shape'}
            aside={scenario.mutation !== undefined ? 'stays on the server; the wire carries { fingerprint, context }' : undefined}
            focused={focused === 'mutation'}
          >
            <Block>{json(scenario.mutation ?? scenario.body)}</Block>
          </Artifact>
        )}

        {panelReached('scope') && scopeClause !== undefined && scopeKey !== undefined && (
          <Artifact id="p-scope" title="Scope — added on the server" aside="the model never sees it" focused={focused === 'scope'}>
            <Block>{`AND ${scopeClause}\n   → ${scopeKey} = ${accountLabelMaybe(String(scope[scopeKey]))}`}</Block>
          </Artifact>
        )}

        {panelReached('scope') && scenario.mode === 'mutate' && scenario.mutation !== undefined && (
          <Artifact id="p-scope-write" title="Write phases for this table" aside="the policy decides whether a verb exists" focused={focused === 'scope'}>
            <Block>{writeRulesText(scenario)}</Block>
          </Artifact>
        )}

        {outcome?.error !== undefined && finished ? (
          <Artifact
            id="p-error"
            tone="bad"
            title={scenario.mode === 'compile' ? 'Refused by the analyzer — before any SQL' : scenario.mode === 'mutate' ? `Refused at the wire${outcome.status !== undefined ? ` · ${outcome.status}` : ''}` : 'Error'}
            focused={focused === 'error'}
          >
            <Block tone="bad">{outcome.error}</Block>
          </Artifact>
        ) : (
          <>
            {panelReached('warn') && outcome !== undefined && outcome.warnings.length > 0 && (
              <Artifact id="p-warn" title="Analyzer warnings" aside={<Chip tone="warn">ran anyway</Chip>} focused={focused === 'warn'}>
                <Block tone="warn">{outcome.warnings.join('\n')}</Block>
              </Artifact>
            )}
            {panelReached('sql') && outcome?.sql !== undefined && (
              <Artifact id="p-sql" title="The SQL vex compiled" aside={<Chip>parameterized</Chip>} focused={focused === 'sql'}>
                <Block>{prettySql(outcome.sql)}</Block>
              </Artifact>
            )}
            {panelReached('mapping') && scenario.mode === 'execute' && (
              <Artifact id="p-mapping" title="Shaping the rows (Prism)" focused={focused === 'mapping'}>
                {scenario.mapping !== undefined ? (
                  <Block>{json(scenario.mapping)}</Block>
                ) : (
                  <div style={{ fontSize: 13, color: INK.soft, lineHeight: 1.5 }}>The rows already have the requested shape, so they pass through unchanged. No model, no reshaping.</div>
                )}
              </Artifact>
            )}
          </>
        )}
      </Grid>

      {outcome?.error === undefined && panelReached('result') && scenario.mode !== 'compile' && outcome !== undefined && (
        <Artifact
          id="p-result"
          tone="ok"
          title={scenario.mode === 'mutate' ? 'What the write returned (RETURNING *)' : 'The answer'}
          aside={`${outcome.rows.length} row${outcome.rows.length === 1 ? '' : 's'} · ${ms(outcome.timing.totalMs)}`}
          focused={focused === 'result'}
        >
          {scenario.mode === 'execute' ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 380px', minWidth: 0 }}>
                <RowsTable rows={outcome.rows} />
              </div>
              <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'center', width: 'min(280px, 100%)' }}>
                <AnswerPhone title="The answer" question={scenario.intent} value={outcome.rows} tone="ok" width={270} status="the app" />
              </div>
            </div>
          ) : (
            <RowsTable rows={outcome.rows} />
          )}
        </Artifact>
      )}

      {scenario.note !== undefined && <Callout tone="accent">{scenario.note}</Callout>}
    </div>
  );
};

const Centered: FC<{ children: ReactNode }> = ({ children }) => <div style={{ padding: 48, textAlign: 'center', color: INK.soft, fontSize: 14 }}>{children}</div>;
