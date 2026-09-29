import type { Unsubscribe } from '../common';
import type { MessageEnvelope } from './schemas';

export type { MessageEnvelope, Unsubscribe };

// `cause` is opaque to the bus: the action runtime stamps it on an `emit` and
// reads it back in the listener, so a chain is counted across the hop (see
// action/runtime/cause.ts). A host's publish carries none — it is a root.
export type ChannelHandler = (payload: unknown, from?: string, cause?: unknown) => void;

export type MessageBus = {
  publish: (channel: string, payload?: unknown, cause?: unknown) => void;
  send: (from: string, to: string, payload?: unknown) => void;
  subscribe: (channel: string, handler: ChannelHandler) => Unsubscribe;
};
