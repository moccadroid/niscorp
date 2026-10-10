// What travels between two moss processes of one deployment, and the two
// functions a host supplies to carry it. The types are here because the
// deployment hands the transport over (`runtime.fabric`); what moss does with
// it is ../server, fabric.ts.

// What crosses: an idempotent, order-independent invalidation or wake. A nudge
// carries no payload — it names the principal whose shell to wake and the
// channel to wake, and that shell re-reads under its own policy, exactly as an
// in-process reaction's `deliver` does. Per-principal, not per-tenant,
// deliberately: `deliver` is per-principal, and a by-tenant fan-out would need
// a readable tag→principals index the identity cache refuses to be (../identity/cache.ts
// "no by-tenant lookup"). A shell lives in one process, so a nudge for a
// principal resident elsewhere is a no-op here and lands there.
export type FabricSignal =
  | { kind: 'invalidate-identity'; principal: string }
  | { kind: 'invalidate-tenant'; tag: string }
  | { kind: 'nudge'; principal: string; channel: string };

// The wire form: a signal stamped with the origin process, so a process ignores
// its own echoes (`LISTEN/NOTIFY` delivers to the sender too). moss stamps and
// checks it; the transport carries it opaquely and understands none of it.
export type FabricMessage = FabricSignal & { origin: string };

// The host's transport, as two functions. `publish` is fire-and-forget — never
// awaited, and moss contains a throw so a slow or dead transport costs the
// mutating call nothing. `subscribe` is called once, with the applier moss
// wants run for every REMOTE message.
export type Fabric = {
  publish: (message: FabricMessage) => void;
  subscribe: (apply: (message: FabricMessage) => void) => void;
};
