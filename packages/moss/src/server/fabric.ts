// ═══════════════════════════════════════════════════════════════
// THE CLUSTER FABRIC — invalidations and nudges that travel between
// processes. Additive, off by default: no hook, and every path behaves
// exactly as it does in one process today.
//
// Moss holds per-process state that is a feature, not an accident — durable
// shells, the identity cache, nudge channels. Three calls mutate it from the
// outside, and the moment two moss processes serve one deployment, a call in
// process A must reach state resident in process B: a role change resetting a
// shell over there, a tenant install forgetting records over there, a reaction
// waking a channel over there. This is the wire it travels.
//
// WHY THESE SIGNALS AND NOT `refresh`. `refresh` already crosses processes —
// the generation counter (../manifest, generation.ts) is a persistent, readable, always-on
// pointer, and a process converges by READING it, even after a restart. It has
// to be, because the thing it guards — the loaded action set — has no other
// heal clock: miss the signal and you serve the wrong manifest indefinitely.
// The three signals here are the opposite kind: every one targets state with a
// bounded heal clock of its own — an identity record re-resolves at
// `revalidateMs`, a shell rebuilds on idle, a nudge is moot by the next render.
// A signal lost to a dropped connection is healed by that clock; the fabric
// only NARROWS the window, it is not a correctness dependency. That is exactly
// what lets this be best-effort, ephemeral, and off by default where the
// generation pointer could be none of the three.
//
// THE TRANSPORT IS THE HOST'S. The seam takes functions, not a connection
// string: a Postgres `LISTEN/NOTIFY` pair on the pool moss already holds is the
// expected implementation, but a test uses an in-memory pair and the raw
// connection (and its own dropped-connection monitoring) never reaches moss's
// pool/client-abstract boundary — which is the whole reason a correctness-grade
// mechanism like generation could not have used NOTIFY, and this one can.
// ═══════════════════════════════════════════════════════════════

import type { Fabric, FabricSignal } from '../runtime';

// The three local-only appliers — what a remote signal runs, and what the
// server's own methods run before they publish. LOCAL-ONLY is load-bearing:
// applying a remote signal must not re-publish it, or a signal would amplify
// A → B → C without end. So these mutate what this process holds and stop.
export type FabricApply = {
  invalidateIdentity: (principal: string) => void;
  invalidateTenant: (tag: string) => void;
  nudge: (principal: string, channel: string) => void;
};

// Wire moss to a fabric. Subscribes the remote-apply router (echo-suppressed,
// contained) and returns the `publish` the mutating paths call AFTER applying
// locally. With no fabric, `publish` is a no-op and nothing is subscribed —
// every path behaves exactly as it does in one process.
export const wireFabric = (
  fabric: Fabric | undefined,
  origin: string,
  apply: FabricApply,
): ((signal: FabricSignal) => void) => {
  if (fabric === undefined) return () => {};

  fabric.subscribe((message) => {
    // Our own echo: this process already applied it before publishing. Dropping
    // it here means a signal is never applied twice on the process that sent it,
    // whatever the transport does with self-delivery.
    if (message.origin === origin) return;
    // Contained: a remote signal is somebody else's news, and a throw applying
    // it must not take down the subscriber the transport is driving.
    try {
      switch (message.kind) {
        case 'invalidate-identity':
          apply.invalidateIdentity(message.principal);
          break;
        case 'invalidate-tenant':
          apply.invalidateTenant(message.tag);
          break;
        case 'nudge':
          apply.nudge(message.principal, message.channel);
          break;
      }
    } catch (err) {
      console.error('[moss:fabric] a remote signal failed to apply', err);
    }
  });

  return (signal) => {
    // Fire-and-forget, and contained: a mutating call has already done its local
    // work, and a dead transport must not turn a successful local invalidation
    // into a thrown error.
    try {
      fabric.publish({ ...signal, origin });
    } catch (err) {
      console.error('[moss:fabric] publish failed', err);
    }
  };
};
