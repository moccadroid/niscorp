import { randomBytes } from 'node:crypto';
import type { Identity } from '../identity';
import { FabricMessageSchema } from '../runtime';
import type { Fabric, FabricSignal } from '../runtime';

export type Signals = {
  invalidateIdentity: (principal: string) => boolean;
  invalidateTag: (tag: string) => number;
  nudge: (principal: string, channel: string) => void;
  deliver: (principal: string, channel: string, payload?: unknown) => boolean;
};

export type SignalDeps = {
  fabric: Fabric | undefined;
  identity: Pick<Identity, 'invalidate' | 'invalidateTag'>;
  reset: (principal: string) => boolean;
  deliver: (principal: string, channel: string, payload?: unknown) => boolean;
};

export const buildSignals = ({ fabric, identity, reset, deliver }: SignalDeps): Signals => {
  const origin = randomBytes(8).toString('hex');
  const applyInvalidateIdentity = (principal: string): boolean => {
    const held = identity.invalidate(principal);
    reset(principal);
    return held;
  };
  const applyInvalidateTag = (tag: string): number => identity.invalidateTag(tag).length;
  const applyNudge = (principal: string, channel: string): void => {
    deliver(principal, channel);
  };
  const publish = wireFabric(fabric, origin, {
    invalidateIdentity: applyInvalidateIdentity,
    invalidateTag: applyInvalidateTag,
    nudge: applyNudge,
  });

  return {
    invalidateIdentity: (principal) => {
      const held = applyInvalidateIdentity(principal);
      publish({ kind: 'invalidate-identity', principal });
      return held;
    },
    invalidateTag: (tag) => {
      // Forgets and does not reset, unlike `invalidateIdentity`: what a tenant's
      // people may reach changed, not who they are, and living shells adopt that
      // in place. A reset would discard what they were in the middle of.
      const forgotten = applyInvalidateTag(tag);
      publish({ kind: 'invalidate-tag', tag });
      return forgotten;
    },
    nudge: (principal, channel) => {
      applyNudge(principal, channel);
      publish({ kind: 'nudge', principal, channel });
    },
    // The payload stays in this process. Across processes only the channel is
    // said, and a shell there reads again under its own policy.
    deliver: (principal, channel, payload) => {
      const local = deliver(principal, channel, payload);
      publish({ kind: 'nudge', principal, channel });
      return local;
    },
  };
};

// The appliers never publish: a remote signal that was published again when
// applied would circle between processes without end.
export type FabricApply = {
  invalidateIdentity: (principal: string) => void;
  invalidateTag: (tag: string) => void;
  nudge: (principal: string, channel: string) => void;
};

export const wireFabric = (
  fabric: Fabric | undefined,
  origin: string,
  apply: FabricApply,
): ((signal: FabricSignal) => void) => {
  if (fabric === undefined) return () => {};

  let refusalSaid = false;

  fabric.subscribe((handed) => {
    const parsed = FabricMessageSchema.safeParse(handed);
    if (!parsed.success) {
      if (refusalSaid) return;
      refusalSaid = true;
      const wrong = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(the message)'}: ${issue.message}`).join('; ');
      console.error(`[moss:fabric] the transport handed over what is not a message, and it was dropped (${wrong}). Said once: what follows it and does not parse is dropped without a line.`);
      return;
    }
    const message = parsed.data;
    if (message.origin === origin) return;
    try {
      switch (message.kind) {
        case 'invalidate-identity':
          apply.invalidateIdentity(message.principal);
          break;
        case 'invalidate-tag':
          apply.invalidateTag(message.tag);
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
    try {
      fabric.publish({ ...signal, origin });
    } catch (err) {
      console.error('[moss:fabric] publish failed', err);
    }
  };
};
