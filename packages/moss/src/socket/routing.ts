import { ClientMessageSchema, PROTOCOL } from '../protocol';
import type { ClientMessage, ServerMessage } from '../protocol';
import type { ShellSession } from '../shells';
import type { Connection } from './connection';

// ═══════════════════════════════════════════════════════════════
// THE MESSAGES A TERMINAL SENDS, read as the protocol says them (../protocol)
// and routed into the session the connection is attached to.
// ═══════════════════════════════════════════════════════════════

// What a terminal sent, read as the protocol says it — or undefined: text that
// is not JSON, JSON that is not one of the protocol's messages, or one of them
// with a field it does not have.
const messageOf = (text: string): ClientMessage | undefined => {
  try {
    const read = ClientMessageSchema.safeParse(JSON.parse(text));
    return read.success ? read.data : undefined;
  } catch {
    return undefined;
  }
};

// The one answer to all three: what a message is, which is true whatever was
// sent, rather than a guess at what the sender meant.
const INVALID_MESSAGE = `Not a message of protocol ${PROTOCOL}: it must be JSON, name a type a terminal sends, and carry that type's fields and no others.`;

// What a transport calls with each message of one connection. `session`
// undefined: the app serves no shell.
export const messageHandler = (session: ShellSession | undefined, connection: Connection, send: (message: ServerMessage) => void): ((text: string) => void) => {
  const act = (text: string): void => {
    const message = messageOf(text);
    if (message === undefined) {
      send({ type: 'error', code: 'invalid_message', message: INVALID_MESSAGE });
      return;
    }
    // An app that declares no shell has nothing to route to, and says so
    // rather than dropping what it was sent. An event names the canvas it
    // came from, so the answer names it too.
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
        // A message the protocol gains and this does not route fails to compile.
        message satisfies never;
    }
  };

  // NOTHING LEAVES THIS HANDLER, for the reason nothing leaves accept. A
  // transport calls it from its own listener, where a throw is an uncaught
  // exception and Node ends the process: one shell failing on one message,
  // and every session on the box is gone. What failed is logged here. The
  // terminal is told only that its message was not acted on — the error's
  // own text is the server's — and the connection stays as it was.
  return (text) => {
    try {
      act(text);
    } catch (error) {
      console.error('[moss/socket] a message could not be acted on:', error);
      try {
        send({ type: 'error', code: 'message_failed', message: 'The server could not act on that message. Why is in its log, not here. The connection is still open.' });
      } catch {
        // The transport is already gone — there is nobody left to tell.
      }
    }
  };
};
