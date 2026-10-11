import { z } from 'zod';

// What travels between two moss processes of one deployment, and the two
// functions a host supplies to carry it. They are here because the deployment
// hands the transport over (`runtime.fabric`); what moss does with it is
// ../server, signals.ts.

// The origin a message is stamped with: the process that published it, so a
// process ignores its own echoes (`LISTEN/NOTIFY` delivers to the sender too).
const stamp = { origin: z.string() };

// WHAT CROSSES, AS A SCHEMA, because what a transport hands back came from
// another process over a wire that is not moss's: it is read by this before
// anything of it is used (../server, signals.ts), and the types below are
// inferred from it, so the two cannot disagree. Strict: a field no message has
// is a message this process does not read.
//
// What crosses is an idempotent, order-independent invalidation or wake. A
// nudge carries no payload — it names the principal whose shell to wake and the
// channel to wake, and that shell re-reads under its own policy, exactly as an
// in-process reaction's `deliver` does. Per-principal, not per-tenant,
// deliberately: `deliver` is per-principal, and a by-tenant fan-out would need
// a readable tag→principals index the identity cache refuses to be (../identity/cache.ts
// "no by-tenant lookup"). A shell lives in one process, so a nudge for a
// principal resident elsewhere is a no-op here and lands there.
export const FabricMessageSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('invalidate-identity'), principal: z.string(), ...stamp }),
  z.strictObject({ kind: z.literal('invalidate-tenant'), tag: z.string(), ...stamp }),
  z.strictObject({ kind: z.literal('nudge'), principal: z.string(), channel: z.string(), ...stamp }),
]);

// The wire form: a signal stamped with the origin process. moss stamps and
// checks it; the transport carries it opaquely and understands none of it.
export type FabricMessage = z.infer<typeof FabricMessageSchema>;

// A signal is a message before it is stamped: what a mutating path publishes.
type Unstamped<Message> = Message extends unknown ? Omit<Message, 'origin'> : never;
export type FabricSignal = Unstamped<FabricMessage>;

// The host's transport, as two functions. `publish` is fire-and-forget — never
// awaited, and moss contains a throw so a slow or dead transport costs the
// mutating call nothing. `subscribe` is called once, with the applier moss
// wants run for every message the transport receives. The applier takes
// whatever the transport read off its wire, untyped: moss reads it by the
// schema, and drops what is not a message.
export type Fabric = {
  publish: (message: FabricMessage) => void;
  subscribe: (apply: (message: unknown) => void) => void;
};
