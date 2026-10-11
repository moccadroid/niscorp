// moss — the nisc app server. One module for each question it answers about a
// request, over two that every module may import, wired by one (DESIGN.md,
// "How the code is laid out"; which module may import which is the table in
// scripts/check-modules.mts):
//
//   runtime/      — what a deployment supplies: the database, the session verifier, the limits, telemetry
//   protocol/     — what both ends of the wire agree on: the messages, the close codes, the delta codec
//   feature/      — what a feature is, and the seams the server starts one with
//   identity/     — who is calling: a token is a principal, a principal is a record
//   manifest/     — what exists for them: the application as authored artifacts, and what a set of roles holds of it
//   data/         — what they may read and write: the engine, the policy for a set of roles, the tables
//   shells/       — what they are looking at: the shell host, a shell's build, its stream, its snapshot
//   socket/       — how it reaches them live: the handshake, the messages, revalidation (transport-blind)
//   documents/    — how it reaches them as a page: the drawn document, the page router, pages as files
//   server/       — the wiring: createServer constructs the modules, starts the features, mounts the routes
//                   (server/node.ts is the `./node` entry: the Node listener + ws transport; Bun swaps it,
//                   never the app. server/vite.ts is the `./vite` entry: the dev plugin.)
//
// This file is the main entry, `@niscorp/moss`: what it exports is what an app
// calls, and `packages/moss/api.txt` lists it.
export { defineApp } from './manifest';
export type { NiscApp, ShellManifest, PageManifest, FunctionSession, LayoutVariant, RunRecord, RunTurn, RunSink } from './manifest';
export { mintDevToken } from './identity';
export type { NiscRuntime } from './runtime';
export type { Telemetry, TelemetrySpan } from './runtime';
export { initSessions, mintSession, sessionOf, revokeAllFor } from './identity';
export { createServer } from './server';
export type { MossServer } from './server';
export type { ExecuteAs } from './data';
export { MOSS_SEQUENCE } from './data';
export type { Feature, FeatureSeams } from './feature';
export { verifyApp } from './manifest';
export type { ManifestReport } from './manifest';
export { CLOSE_INVALID_TOKEN, CLOSE_SIGNED_OUT, PROTOCOL, offerToken } from './protocol';
export type { IdentityRecord } from './identity';
export type { ShellHost, ShellSnapshot } from './shells';
export { createPageRouter, embedSnapshot, documentHeaders, renderDocument, exportDocuments } from './documents';
export { sessionCookies, tokenFromCookie } from './identity';
export type { DocumentConfig, DrawnDocument, ExportedDocument } from './documents';
export type { Connection } from './socket';
export type { ServerMessage } from './protocol';
export { migrateTables } from './data';
export type { TablesReport } from './data';
// A FEATURE is not exported here: it ships from an entry point of its own, and
// nothing this entry reaches imports one. Integrations are
// `@niscorp/moss/integrations` (src/integrations/); a write minted into tide as
// a fact is `@niscorp/moss/tide` (src/tide/). Tide's Postgres store and its
// driver are not moss's at all: `@niscorp/tide/postgres`, `@niscorp/tide`.
