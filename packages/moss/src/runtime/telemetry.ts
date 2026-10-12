export type TelemetrySpan = {
  name: string;
  // A JS number cannot hold epoch nanoseconds exactly: the loss is far below
  // the milliseconds measured here.
  startUnixNano: number;
  endUnixNano: number;
  status: 'ok' | 'error' | 'refused';
  // Identifiers and measurements only: never a payload, a name, or who a principal is.
  attributes: Record<string, string | number | boolean>;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
};

export type Telemetry = {
  emit: (span: TelemetrySpan) => void;
};

export type Emit = (span: TelemetrySpan) => void;

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

export type SpanClock = { startUnixNano: number; endUnixNano: () => number };

const elapsedClock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const spanClock = (): SpanClock => {
  const startUnixNano = Date.now() * 1e6;
  const t0 = elapsedClock();
  return { startUnixNano, endUnixNano: () => startUnixNano + (elapsedClock() - t0) * 1e6 };
};
