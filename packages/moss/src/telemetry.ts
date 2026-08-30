// ═══════════════════════════════════════════════════════════════
// Telemetry — moss's one observability surface, and the SOLE owner of the
// span shape. Every service a Midas deployment runs is a moss process; moss
// is the choke point every engine fact passes through, so moss is where a
// deployment learns how long a vex execution took, which fingerprint is slow,
// how often a policy refuses, how many shells are resident. Instrumenting here
// means a service written tomorrow is observed the day it boots, with no code
// in the service — the same argument the engine boundary makes for queries.
//
// The sink is a deployment decision, not an application one, so the hook lives
// on the runtime (runtime.ts) beside the other operational knobs. Unset, no
// span is ever built: every emission site guards on `emit !== undefined`, and
// an optional call short-circuits its argument, so a hot path with no sink
// allocates nothing.
//
// STRUCTURAL FACTS ONLY. A span carries identifiers and measurements — a
// fingerprint, a duration, a status — never a payload, a context value, a row,
// or a principal beyond presence (`hasPrincipal`). The stream must be safe to
// ship to a third-party backend without a privacy review per span. moss builds
// every span here from what a seam reports; a seam reports facts, moss decides
// what of them is safe to name.
// ═══════════════════════════════════════════════════════════════

// The span, shaped after the OpenTelemetry data model — not the SDK, just the
// shape, so any OTLP backend ingests a JSON mapping of it with no translation.
export type TelemetrySpan = {
  // 'vex.execute' | 'fn.call' | 'shell.build' | 'socket.upgrade' |
  // 'socket.close' | 'integration.call' | …
  name: string;
  // Epoch nanoseconds, millisecond-anchored with a sub-millisecond monotonic
  // span between them. JS numbers cannot hold epoch nanos exactly — the low
  // ~8 bits are lossy — which is far below the millisecond scale of what is
  // measured here, and an exporter re-quantises anyway.
  startUnixNano: number;
  endUnixNano: number;
  // 'refused' is a policy/intake NO — a normal outcome, distinct from a fault.
  status: 'ok' | 'error' | 'refused';
  // Identifiers and measurements. Never a payload, name, address, or context
  // value; a principal appears only as `hasPrincipal`.
  attributes: Record<string, string | number | boolean>;
  // Trace stitching — unused in v1 (no cross-process traceparent yet), carried
  // so a sampler and a propagator can arrive without a shape change.
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
};

// The runtime hook. `emit` is fire-and-forget: never awaited, and wrapped
// (`emitterOf`) so a slow or throwing sink costs the request nothing.
export type Telemetry = {
  emit: (span: TelemetrySpan) => void;
};

export type Emit = (span: TelemetrySpan) => void;

// The one safe emitter every seam derives. `undefined` when no sink is
// configured — the signal each site guards on to build no span at all. When a
// sink is present, its throw is contained here, never the caller's.
export const emitterOf = (telemetry: Telemetry | undefined): Emit | undefined =>
  telemetry === undefined
    ? undefined
    : (span) => {
        try {
          telemetry.emit(span);
        } catch (err) {
          console.error('[moss:telemetry]', err);
        }
      };

// A span's clock: the start stamped once, elapsed read on demand — so one clock
// serves both a short handshake span and a whole-connection span from the same
// origin. Millisecond-anchored start, sub-millisecond monotonic elapsed.
export type SpanClock = { startUnixNano: number; endUnixNano: () => number };

const elapsedClock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const spanClock = (): SpanClock => {
  const startUnixNano = Date.now() * 1e6;
  const t0 = elapsedClock();
  return { startUnixNano, endUnixNano: () => startUnixNano + (elapsedClock() - t0) * 1e6 };
};
