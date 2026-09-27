import { useRef, useState, type CSSProperties, type FC, type ReactNode } from 'react';
import type { Fact, Run, Task } from '@niscorp/tide';
import { Chip, INK, MONO, Panel, type Tone } from '@showroom/chrome/stage/ui';
import { hhmm, isRecord, stamp, type Snapshot } from '../world/ledger';

// ═══════════════════════════════════════════════════════════
// The Ledger — tide's own rows, printed.
//
// Everything tide does between a trigger and an effect is a row it commits
// first: a FACT (something arrived), a RUN (one activation of one reflex) and
// a TASK (one unit of that run — a member, a charge). This panel reads them
// straight out of `tide.ledger` and prints the columns a person needs, newest
// first. Rows that arrived since the last change are tinted, so a click shows
// exactly which rows it wrote. Nothing here is simulated.
// ═══════════════════════════════════════════════════════════

// A value, briefly: `member: mia · via: app`, never a wall of JSON.
export const brief = (v: unknown, max = 70): string => {
  const text = isRecord(v)
    ? Object.entries(v)
        .filter(([, x]) => x !== undefined && x !== null && x !== '')
        .map(([k, x]) => `${k}: ${isRecord(x) || Array.isArray(x) ? JSON.stringify(x) : String(x)}`)
        .join(' · ')
    : v === undefined
      ? ''
      : typeof v === 'string'
        ? v
        : JSON.stringify(v);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const factWhat = (f: Fact): string => {
  if (f.kind === 'write') return `${f.entity ?? '?'}.${f.op ?? 'write'}`;
  if (f.kind === 'signal') return f.name ?? 'signal';
  if (f.kind === 'run') return `${f.reflex ?? '?'} settled`;
  return `run now → ${f.target ?? '?'}`;
};

const factDetail = (f: Fact): string => {
  if (f.kind === 'write') return brief(f.row);
  if (f.kind === 'signal') {
    const p = isRecord(f.payload) ? f.payload : {};
    return brief('type' in p ? { id: p['id'], type: p['type'], created: typeof p['created'] === 'number' ? hhmm(p['created']) : undefined } : p);
  }
  if (f.kind === 'run') return f.stats === undefined ? '' : `${f.stats.done}/${f.stats.total} done${f.stats.failed > 0 ? ` · ${f.stats.failed} failed` : ''}${f.occurrence === undefined ? '' : ` · ${f.occurrence}`}`;
  return `by ${f.by ?? 'someone'}`;
};

const factState = (f: Fact, now: number): { tone: Tone; text: string } => {
  if (f.parked !== undefined) return { tone: 'bad', text: 'parked' };
  if (f.deliveredAt !== undefined) return { tone: 'ok', text: 'delivered' };
  if (f.notBefore !== undefined && f.notBefore > now) return { tone: 'warn', text: `waits till ${hhmm(f.notBefore)}` };
  return { tone: 'warn', text: 'pending' };
};

const runState = (r: Run): { tone: Tone; text: string } => {
  if (r.state === 'settled') return { tone: r.failed > 0 ? 'warn' : 'ok', text: 'settled' };
  if (r.state === 'skipped') return { tone: 'idle', text: 'skipped' };
  if (r.state === 'fanned') return { tone: 'warn', text: 'running' };
  return { tone: 'warn', text: 'pending' };
};

const taskTone = (t: Task): Tone => (t.state === 'done' ? 'ok' : t.state === 'failed' ? 'bad' : 'warn');

// What set a fact in motion: the host, a reflex's effect, or tide itself.
const sourceOf = (f: Fact, tasks: readonly Task[]): string => {
  if (f.cause === undefined) return f.kind === 'manual' ? 'a person' : 'the host';
  if (f.cause.startsWith('task:')) return tasks.find((t) => t.id === f.cause?.slice(5))?.reflexId ?? 'an effect';
  if (f.cause.startsWith('run:')) return 'tide';
  return f.cause;
};

const causeOf = (r: Run, facts: readonly Fact[]): string => {
  const [kind, rest = ''] = r.cause.split(/:(.*)/s);
  if (kind === 'occurrence') return `clock · ${rest}`;
  if (kind === 'manual') return `by hand · ${rest}`;
  if (kind === 'fact') {
    const f = facts.find((x) => x.id === rest);
    return f === undefined ? rest : `${rest} · ${factWhat(f)}`;
  }
  return r.cause;
};

// ── the table ───────────────────────────────────────────────────

const th: CSSProperties = { textAlign: 'left', padding: '5px 8px', color: INK.faint, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#fff' };
const td: CSSProperties = { padding: '5px 8px', verticalAlign: 'top' };
const mono: CSSProperties = { fontFamily: MONO, fontSize: 11, color: INK.soft };

const Table: FC<{ title: ReactNode; hint: string; heads: readonly string[]; empty: string; children: ReactNode; count: number; maxHeight: number }> = ({ title, hint, heads, empty, children, count, maxHeight }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{title}</span>
      <span style={{ fontSize: 12, color: INK.faint }}>{hint}</span>
    </div>
    <div style={{ border: `1px solid ${INK.line}`, borderRadius: 10, overflow: 'auto', maxHeight }}>
      {count === 0 ? (
        <div style={{ padding: '8px 10px', fontSize: 12, color: INK.faint }}>{empty}</div>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
          <thead>
            <tr>
              {heads.map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      )}
    </div>
  </div>
);

const Row: FC<{ fresh: boolean; children: ReactNode }> = ({ fresh, children }) => (
  <tr style={{ borderTop: `1px solid ${INK.line}`, background: fresh ? INK.accentWash : 'transparent', transition: 'background 400ms' }}>{children}</tr>
);

export type Refused = { at: number; what: string; why: string };

// Which rows are new since the ledger last changed. Kept per snapshot, so a
// re-render for any other reason doesn't wash the tint away.
const useFresh = (ledger: Snapshot): ReadonlySet<string> => {
  const memo = useRef<{ snap?: Snapshot; seen: Set<string>; fresh: Set<string> }>({ seen: new Set(), fresh: new Set() });
  if (memo.current.snap !== ledger) {
    const all = new Set([...ledger.facts, ...ledger.runs, ...ledger.tasks].map((r) => r.id));
    const first = memo.current.snap === undefined || all.size < memo.current.seen.size;
    memo.current = { snap: ledger, seen: all, fresh: first ? new Set() : new Set([...all].filter((id) => !memo.current.seen.has(id))) };
  }
  return memo.current.fresh;
};

export const LedgerTables: FC<{ ledger: Snapshot; refused?: readonly Refused[]; maxHeight?: number }> = ({ ledger, refused = [], maxHeight = 240 }) => {
  const fresh = useFresh(ledger);
  const { facts, runs, tasks, now } = ledger;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Table title={`Facts (${facts.length})`} hint="what arrived — a write, a signal, a person, or a run settling" heads={['id', 'at', 'fact', 'detail', 'from', 'state']} empty="Nothing has arrived yet." count={facts.length} maxHeight={maxHeight}>
        {facts.map((f) => {
          const s = factState(f, now);
          return (
            <Row key={f.id} fresh={fresh.has(f.id)}>
              <td style={{ ...td, ...mono }}>{f.id}</td>
              <td style={{ ...td, ...mono, whiteSpace: 'nowrap' }}>{stamp(f.at)}</td>
              <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{factWhat(f)}</td>
              <td style={{ ...td, ...mono }}>
                {factDetail(f)}
                {f.dedupeKey !== undefined && <div style={{ color: INK.faint }}>dedupe key: {f.dedupeKey}</div>}
              </td>
              <td style={{ ...td, whiteSpace: 'nowrap', color: INK.soft }}>{sourceOf(f, tasks)}</td>
              <td style={td}>
                <Chip tone={s.tone}>{s.text}</Chip>
              </td>
            </Row>
          );
        })}
      </Table>
      {refused.length > 0 && (
        <Table title={`Refused at the door (${refused.length})`} hint="ingest() returned nothing — never stored, so no run can start from it" heads={['at', 'what', 'why']} empty="" count={refused.length} maxHeight={maxHeight}>
          {[...refused].reverse().map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${INK.line}` }}>
              <td style={{ ...td, ...mono, whiteSpace: 'nowrap' }}>{stamp(r.at)}</td>
              <td style={{ ...td, ...mono }}>{r.what}</td>
              <td style={td}>
                <Chip tone="idle">{r.why}</Chip>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Table title={`Runs (${runs.length})`} hint="one activation of one reflex — unique per reflex and cause" heads={['id', 'reflex', 'cause', 'state', 'done', 'selected', 'note']} empty="No reflex has run yet." count={runs.length} maxHeight={maxHeight}>
        {runs.map((r) => {
          const s = runState(r);
          return (
            <Row key={r.id} fresh={fresh.has(r.id)}>
              <td style={{ ...td, ...mono }}>{r.id}</td>
              <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.reflexId}</td>
              <td style={{ ...td, ...mono }}>{causeOf(r, facts)}</td>
              <td style={td}>
                <Chip tone={s.tone}>{s.text}</Chip>
              </td>
              <td style={{ ...td, ...mono, whiteSpace: 'nowrap' }}>
                {r.done}/{r.total}
                {r.failed > 0 && <span style={{ color: INK.bad }}> · {r.failed} failed</span>}
              </td>
              <td style={{ ...td, ...mono, color: r.selected === 0 ? INK.warn : INK.soft }}>{r.selected ?? '—'}</td>
              <td style={{ ...td, fontSize: 11.5, color: INK.soft }}>{r.note ?? (r.selected === 0 ? 'selected nothing — nothing to do' : '')}</td>
            </Row>
          );
        })}
      </Table>
      <Table title={`Tasks (${tasks.length})`} hint="one unit of a run, written before its effect — the grain of “exactly once”" heads={['id', 'reflex', 'unit', 'state', 'attempt', 'notes']} empty="No tasks yet." count={tasks.length} maxHeight={maxHeight}>
        {tasks.map((t) => (
          <Row key={t.id} fresh={fresh.has(t.id)}>
            <td style={{ ...td, ...mono }}>{t.id}</td>
            <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{t.reflexId}</td>
            <td style={{ ...td, ...mono }}>{t.unit === '' ? '(the fact’s row)' : t.unit}</td>
            <td style={td}>
              <Chip tone={taskTone(t)}>{t.state}</Chip>
            </td>
            <td style={{ ...td, ...mono }}>{t.attempt}</td>
            <td style={{ ...td, ...mono, color: t.error === undefined ? INK.soft : INK.bad }}>
              {t.error ?? brief(t.output)}
              {t.state === 'retrying' && <span style={{ color: INK.warn }}> · next try {hhmm(t.notBefore)}</span>}
            </td>
          </Row>
        ))}
      </Table>
    </div>
  );
};

// The panel: collapsible, with the counts always visible on its header.
export const Ledger: FC<{ ledger: Snapshot | undefined; refused?: readonly Refused[]; defaultOpen?: boolean; aside?: ReactNode; maxHeight?: number }> = ({
  ledger,
  refused,
  defaultOpen = false,
  aside,
  maxHeight,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const counts = ledger === undefined ? '…' : `${ledger.facts.length} facts · ${ledger.runs.length} runs · ${ledger.tasks.length} tasks`;
  return (
    <Panel
      title={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ font: 'inherit', fontSize: 13, fontWeight: 650, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: INK.text }}
        >
          {open ? '▾' : '▸'} The ledger — tide’s own rows <span style={{ fontWeight: 500, color: INK.faint }}>· {counts}</span>
        </button>
      }
      aside={aside ?? 'read from tide.ledger — real rows, newest first'}
    >
      {open && ledger !== undefined ? (
        <LedgerTables ledger={ledger} refused={refused} maxHeight={maxHeight} />
      ) : (
        <div style={{ fontSize: 12.5, color: INK.soft }}>
          Everything tide did here is a row it committed first.{' '}
          <button type="button" onClick={() => setOpen(true)} style={{ font: 'inherit', background: 'none', border: 'none', padding: 0, color: INK.accent, cursor: 'pointer', fontWeight: 600 }}>
            Open the ledger
          </button>{' '}
          to read them.
        </div>
      )}
    </Panel>
  );
};
