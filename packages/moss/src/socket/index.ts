// ═══════════════════════════════════════════════════════════════
// The socket — how what somebody is looking at reaches them live.
//
// The fifth question moss asks of a request, on the live wire: the authority
// channel (DESIGN.md § The socket), protocol layer. The socket invents
// nothing: JSON frames, every canvas-bound message carries its canvas id,
// reconnect just re-sends current state.
//
// IT IS TRANSPORT-BLIND (./connection.ts). It speaks through the four-function
// `Connection` seam; the RFC 6455 plumbing lives with each runtime's entry
// (`ws` on Node in ../server, transport.ts; Bun-native later) and is never
// hand-written.
//
// WHAT IT IS HANDED (./config.ts) is a typed object of the functions and
// values it needs: who a token is, what somebody holds, where a session comes
// from. No manifest, no runtime and no shell host.
//
// THE HANDSHAKE (./handshake.ts) decides who is asking on the upgrade request:
// the protocol spoken, the token offered, the cookie and the seal the app's
// own page carries.
//
// ONE ACCEPT PER CONNECTION (./socket.ts): the handshake, the CATALOG channel
// (`hello` on connect — the resolved application + its version token; equal
// hash, equal application), and the canvas streams (`render` down, `event` up)
// fed by the shell the connection is attached to.
//
// THE MESSAGES A TERMINAL SENDS (./routing.ts) are read by the protocol's
// schema and routed into that session. An app whose manifest declares no shell
// has no streams, and a message aimed at one is answered honestly with
// `no_shell` rather than silently dropped.
//
// A SHELL FOR NOBODY TAKES A PLACE (./places.ts): somebody signed in has one
// shell, nobody signed in has one for each connection, and how many of those
// are alive at once has a limit.
//
// IDENTITY IS ASKED TWICE (./revalidation.ts): once at upgrade, and then on a
// timer for as long as the connection lives. The second is what lets a
// `session` verifier's expiry mean anything here — the HTTP surfaces re-ask on
// every request, and a socket that asked once would be the hole every
// long-lived credential leaks through.
//
// This module imports `runtime`, `protocol`, `identity` and `shells`, and
// nothing else of moss.
// ═══════════════════════════════════════════════════════════════

export type { HeldCatalog, SessionSource, SocketConfig } from './config';
export type { Connection, SocketAccept, TransportSettings } from './connection';
export { DEFAULT_ANONYMOUS_SHELL_MAX } from './places';
export { DEFAULT_REVALIDATE_MS } from './revalidation';
export { createSocket } from './socket';
