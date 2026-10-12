import { ClientMessageSchema, PROTOCOL } from '../protocol';
import type { ClientMessage, ServerMessage } from '../protocol';
import type { ShellSession } from '../shells';
import type { Connection } from './socket';

const messageOf = (text: string): ClientMessage | undefined => {
  try {
    const read = ClientMessageSchema.safeParse(JSON.parse(text));
    return read.success ? read.data : undefined;
  } catch {
    return undefined;
  }
};

const INVALID_MESSAGE = `Not a message of protocol ${PROTOCOL}: it must be JSON, name a type a terminal sends, and carry that type's fields and no others.`;

export const messageHandler = (session: ShellSession | undefined, connection: Connection, send: (message: ServerMessage) => void): ((text: string) => void) => {
  const act = (text: string): void => {
    const message = messageOf(text);
    if (message === undefined) {
      send({ type: 'error', code: 'invalid_message', message: INVALID_MESSAGE });
      return;
    }
    if (session === undefined) {
      send({ type: 'error', code: 'no_shell', message: 'This app serves no shell.', ...(message.type === 'event' ? { canvas: message.canvas } : {}) });
      return;
    }
    switch (message.type) {
      case 'reset':
        session.reset();
        return;
      case 'resync':
        session.resync(connection);
        return;
      case 'back':
        session.back();
        return;
      case 'popTo':
        session.popTo(message.canvas, message.instance);
        return;
      case 'publish':
        session.publish(message.channel, message.payload);
        return;
      case 'event':
        session.dispatch(message.canvas, message.event);
        return;
      default:
        message satisfies never;
    }
  };

  // Nothing may throw out of this handler: a transport calls it from its own
  // listener, where a throw is uncaught and ends the process.
  return (text) => {
    try {
      act(text);
    } catch (error) {
      console.error('[moss/socket] a message could not be acted on:', error);
      try {
        send({ type: 'error', code: 'message_failed', message: 'The server could not act on that message. Why is in its log, not here. The connection is still open.' });
      } catch {
        // The transport is already gone: nobody is left to tell.
      }
    }
  };
};
