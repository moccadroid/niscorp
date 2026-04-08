import type { Unsubscribe } from '../common';
import type { MessageEnvelope } from './schemas';

export type { MessageEnvelope, Unsubscribe };

export type ChannelHandler = (payload: unknown, from?: string) => void;

export type MessageBus = {
  publish: (channel: string, payload?: unknown) => void;
  send: (from: string, to: string, payload?: unknown) => void;
  subscribe: (channel: string, handler: ChannelHandler) => Unsubscribe;
};
