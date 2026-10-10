// moss — the nisc app server. One module per concern:
//
//   manifest/     — the manifest: the application as authored artifacts, and what a set of roles holds of it
//   runtime/      — the environment: database, cache, session
//   data/         — what somebody may read and write: the engine, the policy for a set of roles, the tables
//   feature/      — what a feature is, and the seams the server starts one with
//   shells.ts     — the shell host: durable per-principal server shells
//   socket.ts     — the authority channel: envelope + protocol (transport-blind)
//   server.ts     — boot refusal + the HTTP surfaces + the socket accept
//   node.ts       — the Node listener + ws transport (./node subpath; Bun swaps this, never the app)
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
export { resolveRoles, memoKeyOf } from './identity';
export { resolvePolicy } from './data';
export { resolveVariants, verifyApp } from './manifest';
export type { ManifestReport } from './manifest';
export { createTideStore, TIDE_DDL, TIDE_SEQUENCE, TIDE_TABLES } from './tide';
export { createTideDriver } from './driver';
export type { TideDriver } from './driver';
export { CLOSE_INVALID_TOKEN, CLOSE_SIGNED_OUT, PROTOCOL, offerToken } from './protocol';
export type { IdentityRecord } from './identity';
export type { ShellHost, ShellSnapshot } from './shells';
export { tokenFromCookie, embedSnapshot, documentHeaders, renderDocument, exportDocuments } from './document';
export { sessionCookies } from './identity';
export type { DocumentConfig, DrawnDocument, ExportedDocument } from './document';
export { createPageRouter } from './pages';
export type { Connection } from './socket';
export type { ServerMessage } from './protocol';
export { migrateTables } from './data';
export type { TablesReport } from './data';
// A FEATURE is not exported here: it ships from an entry point of its own, and
// nothing this entry reaches imports one. Integrations are
// `@niscorp/moss/integrations` (src/integrations/).
