import { randomBytes } from 'node:crypto';
import type { Identity } from '../identity';
import type { Fabric } from '../runtime';
import { wireFabric } from './fabric';

// ═══════════════════════════════════════════════════════════════
// THE SIGNALS THAT CROSS PROCESSES, and this process's half of each.
//
// WHAT EACH ONE IS FOR. `invalidateIdentity`: who one person is changed;
// they are forgotten and their shells rebuilt. `invalidateTenant`: what a
// tenant's people may reach changed; their records are forgotten and no shell
// is rebuilt. `nudge`: something a person is looking at changed; every living
// shell of theirs is told the channel, and reads again. Each is applied here
// and then said to every other process. `deliver` is the nudge a reaction
// makes: here it carries what the reaction handed it, and to every other
// process it is a nudge, which carries nothing.
//
// One origin per process, stamped on every signal so a process ignores its
// own echoes. The three appliers are LOCAL-ONLY — they mutate what this
// process holds and never publish — and are shared by two callers: a remote
// signal (through `wireFabric`'s subscriber) and this server's own methods,
// which run the applier THEN publish. Absent a fabric, publishing is a no-op
// and nothing is subscribed. `refresh` is deliberately not here: it rides the
// generation pointer, which is persistent and survives a restart, because the
// manifest it guards has no other heal clock (./fabric.ts; ../manifest,
// generation.ts).
// ═══════════════════════════════════════════════════════════════

export type Signals = {
  // `MossServer.invalidateIdentity`, `invalidateTenant` and `nudge`: applied
  // here, then published.
  invalidateIdentity: (principal: string) => boolean;
  invalidateTenant: (tag: string) => number;
  nudge: (principal: string, channel: string) => void;
  // What a reaction is handed: delivered here with its payload, to every
  // living shell of the principal, and nudged everywhere else without one.
  // `false`: no shell of theirs lives in this process.
  deliver: (principal: string, channel: string, payload?: unknown) => boolean;
};

export type SignalDeps = {
  fabric: Fabric | undefined;
  identity: Pick<Identity, 'invalidate' | 'invalidateTag'>;
  // Reset every living shell of one principal, in every host: the app's own
  // and each page's (./hosts.ts, `Hosts.reset`).
  reset: (principal: string) => boolean;
  // Put a message to every living shell of one principal, in every host: the
  // app's own and each page's (./hosts.ts, `Hosts.deliver`).
  deliver: (principal: string, channel: string, payload?: unknown) => boolean;
};

export const buildSignals = ({ fabric, identity, reset, deliver }: SignalDeps): Signals => {
  const origin = randomBytes(8).toString('hex');
  // Who somebody is changed: what is held of them is forgotten, and every
  // shell built for them is rebuilt, whichever host built it.
  const applyInvalidateIdentity = (principal: string): boolean => {
    const held = identity.invalidate(principal);
    reset(principal);
    return held;
  };
  const applyInvalidateTenant = (tag: string): number => identity.invalidateTag(tag).length;
  // Tell every living shell of one principal that a channel changed,
  // payload-less — each reads again. EVERY ONE: the shell the app keeps for
  // them, and the one a page built for each connection they have to it. If
  // none of theirs lives here this does nothing, and the process that holds
  // them applies the same signal. No tag lookup: a delivery is per-principal,
  // and the identity cache is deliberately not a by-tenant index.
  const applyNudge = (principal: string, channel: string): void => {
    deliver(principal, channel);
  };
  const publish = wireFabric(fabric, origin, {
    invalidateIdentity: applyInvalidateIdentity,
    invalidateTenant: applyInvalidateTenant,
    nudge: applyNudge,
  });

  return {
    invalidateIdentity: (principal) => {
      // The compiled memos are keyed by (roles + installed), not by principal,
      // so they need no clearing here: a re-resolved record either lands on the
      // same key — in which case the memo was already right — or on a different
      // one, which was never this principal's to begin with.
      //
      // Applied locally, then published: the process where this principal's
      // shell is resident resets it, whichever process that is.
      const held = applyInvalidateIdentity(principal);
      publish({ kind: 'invalidate-identity', principal });
      return held;
    },
    invalidateTenant: (tag) => {
      // FORGETS, AND DOES NOT RESET.
      //
      // Resetting throws a shell away and builds its replacement, which is
      // right for a ROLE change — the landing surface and the nav were seeded
      // from the old rung — and wrong here. A tenant installing an integration changes
      // what its people may REACH, not who they are, and `adopt` (called by
      // `refresh` alongside this) re-resolves every live shell and registers
      // the new definitions in place. Resetting as well would discard whatever
      // anybody at that studio was in the middle of, to arrive at the same
      // screen.
      //
      // A caller who does mean "rebuild theirs" has `invalidateIdentity`, which
      // is what a role change uses.
      //
      // Applied locally, then published: a second process forgets the same
      // tenant's records, and its live shells pick up the changed actions
      // through the generation pointer's own adopt — the fabric carries the
      // record-forget, generation carries the manifest.
      const forgotten = applyInvalidateTenant(tag);
      publish({ kind: 'invalidate-tenant', tag });
      return forgotten;
    },
    nudge: (principal, channel) => {
      applyNudge(principal, channel);
      publish({ kind: 'nudge', principal, channel });
    },
    // Local delivery carries the payload — an optimisation for the
    // shells resident in THIS process. The cross-process nudge is
    // payload-less: a shell in another process re-reads under its
    // own policy, which is the row-less doctrine and the only safe
    // thing to send off-box. No fabric → the publish is a no-op and
    // this is a delivery to the shells that live here.
    deliver: (principal, channel, payload) => {
      const local = deliver(principal, channel, payload);
      publish({ kind: 'nudge', principal, channel });
      return local;
    },
  };
};
