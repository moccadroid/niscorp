// moss — the nisc app server. One module per concern:
//
//   app.ts        — the manifest: the application as authored artifacts
//   runtime.ts    — the environment: database, cache, session
//   data.ts       — the data layer, stood up from what's present
//   principal.ts  — per-principal resolution: roles, policy, catalog
//   shells.ts     — the shell host: durable per-principal server shells
//   socket.ts     — the authority channel: envelope + protocol (transport-blind)
//   server.ts     — boot refusal + the HTTP surfaces + the socket accept
//   node.ts       — the Node listener + ws transport (./node subpath; Bun swaps this, never the app)
export { defineApp } from './app';
export type { NiscApp, ShellManifest, FunctionSession } from './app';
export { devSession, mintDevToken } from './runtime';
export type { NiscRuntime } from './runtime';
export { createServer } from './server';
export type { MossServer } from './server';
export { resolveRoles, resolvePolicy, resolveCatalog } from './principal';
export type { Catalog } from './principal';
export { createDataLayer } from './data';
export { auditClosure } from './closure';
export type { DataLayer } from './data';
export { createSocket, CLOSE_INVALID_TOKEN, CLOSE_SIGNED_OUT } from './socket';
export { createShellHost } from './shells';
export type { ShellHost, ShellSession } from './shells';
export type { Connection, ServerMessage, ClientMessage, SocketAccept, SocketContext } from './socket';
