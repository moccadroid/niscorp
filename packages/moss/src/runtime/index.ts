// ═══════════════════════════════════════════════════════════════
// The runtime — what a deployment supplies.
//
// An application is its artifacts; this is the other half, what those
// artifacts run ON, and it is decided by whoever deploys: the database, how a
// token becomes a principal, the operational limits (./runtime.ts), where
// telemetry goes (./telemetry.ts), and how a signal reaches a second process
// (./fabric.ts).
//
// It is types, and the two small functions every emitter of a span shares.
// What moss DOES with any of it belongs to the module that asks.
//
// This module imports nothing else of moss; every other module may import it.
// ═══════════════════════════════════════════════════════════════

export type { Fabric, FabricMessage, FabricSignal } from './fabric';
export type { NiscRuntime, SessionVerifier } from './runtime';
export { emitterOf, spanClock } from './telemetry';
export type { Emit, SpanClock, Telemetry, TelemetrySpan } from './telemetry';
