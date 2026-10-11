// This file is an entry point: `@niscorp/moss/protocol`.
//
// For code that speaks the wire itself: a client written by hand (a check
// that opens a socket and reads frames), or a transport other than the one in
// `@niscorp/moss/node`. A terminal uses `@niscorp/moss/client`, and an app
// served by `nisc` or `serve` needs none of this.
export { CLOSE_INVALID_TOKEN, CLOSE_SIGNED_OUT, PROTOCOL, offerToken } from '../protocol';
export type { ServerMessage } from '../protocol';
export type { Connection } from '../socket';
