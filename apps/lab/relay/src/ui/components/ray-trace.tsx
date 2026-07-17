import { useState } from 'react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/react';
import { type TraceStep } from '@relay/server/functions/ray/trace';

// RayTrace — shows the tools Ray is calling. Two modes:
//   • live=true   → subscribes to the in-flight run; each call appears the moment
//                   it fires and fills in when it completes ("Ray is thinking…").
//   • steps=[...] → a finished message's tool calls, headed by "Ray thought for X".
// Tool names + timing are ALWAYS shown. The debug toggle (Settings → Ray) only
// adds the expandable JSON input/output per step. Self-contained dark styling.
const RayTraceProps = z
  .object({
    steps: z.array(z.unknown()).optional().describe("A finished message's recorded tool calls."),
    live: z.boolean().optional().describe('Subscribe to the in-flight run and stream steps live.'),
    debug: z.boolean().optional().describe('Show the expandable JSON detail per step (the server-side per-user preference).'),
    ms: z.number().optional().describe('Total run duration for a finished message.'),
  })
  .strict();

// Human duration — minutes/seconds, never raw ms.
const fmtDuration = (ms: number): string => {
  const s = ms / 1000;
  if (s >= 60) {
    const m = Math.floor(s / 60);
    return `${m}m ${Math.round(s % 60)}s`;
  }
  if (s >= 10) return `${Math.round(s)}s`;
  return `${s.toFixed(1)}s`;
};

const C = {
  wrap: { display: 'flex', flexDirection: 'column' as const, gap: 4, margin: '2px 0 4px' },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    border: 'none',
    padding: 0,
    fontSize: 12,
    color: '#6b7180',
    fontStyle: 'italic' as const,
    cursor: 'pointer',
  },
  headChev: (open: boolean) => ({
    display: 'inline-block',
    fontSize: 9,
    fontStyle: 'normal' as const,
    transition: 'transform 120ms ease',
    transform: open ? 'rotate(90deg)' : 'none',
  }),
  step: (err: boolean) => ({
    border: `1px solid ${err ? 'rgba(248,113,113,0.30)' : 'rgba(255,255,255,0.07)'}`,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 7,
    overflow: 'hidden' as const,
  }),
  row: (clickable: boolean) => ({
    display: 'flex',
    alignItems: 'baseline',
    gap: 7,
    padding: '5px 8px',
    cursor: clickable ? ('pointer' as const) : ('default' as const),
    userSelect: 'none' as const,
  }),
  chev: (open: boolean) => ({
    display: 'inline-block',
    fontSize: 9,
    color: '#6b7180',
    transition: 'transform 120ms ease',
    transform: open ? 'rotate(90deg)' : 'none',
  }),
  name: { fontSize: 12, fontWeight: 600, color: '#cdd1d9', fontFamily: 'ui-monospace, Menlo, monospace' },
  ms: { fontSize: 10, color: '#6b7180', marginLeft: 'auto' as const },
  running: { fontSize: 10, color: '#c9a14a', fontStyle: 'italic' as const, marginLeft: 'auto' as const },
  io: { padding: '2px 8px 8px', borderTop: '1px solid rgba(255,255,255,0.06)' },
  label: { fontSize: 9, color: '#6b7180', textTransform: 'uppercase' as const, letterSpacing: 0.4, margin: '6px 0 1px' },
  json: {
    margin: 0,
    fontSize: 11,
    lineHeight: 1.45,
    color: '#c8ccd4',
    fontFamily: 'ui-monospace, Menlo, monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    maxHeight: 220,
    overflow: 'auto',
  },
};

const Json = ({ value }: { value: unknown }) => <pre style={C.json}>{JSON.stringify(value, null, 2)}</pre>;

// One tool call. Always shows name + status (running… / duration); in debug mode
// the row toggles the JSON input (and output once it lands).
const Step = ({ s, debug }: { s: TraceStep; debug: boolean }) => {
  const [open, setOpen] = useState(false);
  const running = s.status === 'running';
  return (
    <div style={C.step(s.status === 'error')}>
      <div style={C.row(debug)} onClick={debug ? () => setOpen((o) => !o) : undefined}>
        {debug && <span style={C.chev(open)}>▸</span>}
        <span style={C.name}>{s.tool}</span>
        {running ? <span style={C.running}>running…</span> : <span style={C.ms}>{fmtDuration(s.ms ?? 0)}</span>}
      </div>
      {debug && open && (
        <div style={C.io}>
          <div style={C.label}>input</div>
          <Json value={s.input} />
          {!running && (
            <>
              <div style={C.label}>{s.status === 'error' ? 'error' : 'output'}</div>
              <Json value={s.output} />
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const RayTrace: NovaComponent<z.infer<typeof RayTraceProps>> = ({
  steps,
  live,
  ms,
  debug,
}: z.infer<typeof RayTraceProps>) => {
  const [collapsed, setCollapsed] = useState(false);
  // Live mode shows the header only — the run happens server-side; its
  // steps arrive with the reply. (Streaming them mid-run is a later socket
  // slice.)
  const data: TraceStep[] = live === true ? [] : ((steps as TraceStep[] | undefined) ?? []);

  if (live !== true && data.length === 0) return null;

  const showDetail = debug === true;
  const head = live === true ? 'Ray is thinking…' : ms !== undefined ? `Ray thought for ${fmtDuration(ms)}` : `Ray · ${data.length} steps`;

  return (
    <div style={C.wrap}>
      <button type="button" style={C.head} onClick={() => setCollapsed((c) => !c)}>
        <span style={C.headChev(!collapsed)}>▸</span>
        {head}
      </button>
      {!collapsed && data.map((s, i) => <Step key={i} s={s} debug={showDetail} />)}
    </div>
  );
};
RayTrace.meta = {
  description: "Ray's tool calls — streamed live as they run, then a 'thought for X' summary. Debug toggle adds JSON input/output.",
  propsSchema: RayTraceProps,
};
