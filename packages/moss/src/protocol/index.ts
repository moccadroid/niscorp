// ═══════════════════════════════════════════════════════════════
// The protocol — what both ends of the wire agree on.
//
// The server (../socket.ts, ../shells.ts) and the terminal (../client) are
// built and shipped apart, and a browser may run a terminal older than the
// server it reaches. So whatever one end writes for the other to read is said
// here, once: how a connection is opened and ended, the messages on it, the
// frame delta codec, and what a browser's session goes by.
//
// This module imports nothing else of moss, and it is all of moss the terminal
// side imports.
// ═══════════════════════════════════════════════════════════════

export {
  PROTOCOL,
  PROTOCOL_MIN,
  SUBPROTOCOL,
  offerToken,
  offeredToken,
  offeredSealed,
  CLOSE_INVALID_TOKEN,
  CLOSE_SIGNED_OUT,
  CLOSE_SHELL_FAILED,
  CLOSE_PROTOCOL_MISMATCH,
} from './connection';
export { encodeDelta, applyDelta, frameHash } from './delta';
export type { DeltaOp } from './delta';
export { ClientMessageSchema } from './messages';
export type { ClientMessage, ServerMessage } from './messages';
export { DEFAULT_TOKEN_KEY, heldCookieName, sessionNameOf } from './session-name';
