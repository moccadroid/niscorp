// ═══════════════════════════════════════════════════════════════
// @niscorp/moss/client — the wire: the terminal's end of the socket. What it
// and the server agree on is ../protocol, and that is all of moss this module
// imports.
//
//   ./wire.ts        the connection: one socket, its status, when to try again
//   ./credential.ts  who the terminal is between connects
//   ./screen.ts      what it holds of the screen: the frame, a tree per canvas
//   ./env.ts         the host it runs in, and the browser's (`./node` has Node's)
//   ./document.ts    the screen a server-drawn page carries, read out of it
// ═══════════════════════════════════════════════════════════════

export { createWire } from './wire';
export type { Wire, WireConfig, WireStatus } from './wire';
export type { WireSnapshot } from './screen';
export { browserEnv } from './env';
export type { WireEnv, WireTokenStore } from './env';
export { readDocumentSnapshot } from './document';
// What a server-rendered document carries beside its HTML, and the id of the
// element it rides in. The server writes both and `readDocumentSnapshot` reads
// them, so they are the protocol's.
export { SNAPSHOT_ELEMENT_ID } from '../protocol';
export type { DocumentSnapshot } from '../protocol';
