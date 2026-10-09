// moss — the nisc app server. One module per concern:
//
//   app.ts        — the manifest: the application as authored artifacts
//   runtime/      — the environment: database, cache, session
//   data.ts       — the data layer, stood up from what's present
//   principal.ts  — per-principal resolution: roles, policy, catalog
//   shells.ts     — the shell host: durable per-principal server shells
//   socket.ts     — the authority channel: envelope + protocol (transport-blind)
//   server.ts     — boot refusal + the HTTP surfaces + the socket accept
//   node.ts       — the Node listener + ws transport (./node subpath; Bun swaps this, never the app)
export { defineApp } from './app';
export type { NiscApp, ShellManifest, PageManifest, FunctionSession, LayoutVariant, RunRecord, RunTurn, RunSink } from './app';
export { mintDevToken } from './identity';
export type { NiscRuntime } from './runtime';
export type { Telemetry, TelemetrySpan } from './runtime';
export { initSessions, mintSession, sessionOf, revokeAllFor } from './identity';
export { createServer } from './server';
export type { MossServer, ExecuteAs } from './server';
export { MOSS_SEQUENCE, integrationOfAction, integrationByKey, listAttachments, listPlacements, resolveCatalogForRoles } from './integrations';
export type { StorePress, CallIntegration } from './integrations';
export { createAssertionSigner } from './assert';
export { resolveRoles, resolvePolicy, resolveCatalog, resolveVariants, resolvePolicyForRoles, verifyVariants, wearableOf, memoKeyOf } from './principal';
export { createTideStore, TIDE_DDL, TIDE_SEQUENCE, TIDE_TABLES } from './tide';
export { createTideDriver } from './driver';
export type { TideDriver } from './driver';
export { auditClosure } from './closure';
export { CLOSE_INVALID_TOKEN, CLOSE_SIGNED_OUT, PROTOCOL, offerToken } from './protocol';
export type { IdentityRecord } from './identity';
export type { ShellHost, ShellSnapshot } from './shells';
export { tokenFromCookie, embedSnapshot, documentHeaders, renderDocument, exportDocuments } from './document';
export { sessionCookies } from './identity';
export type { DocumentConfig, DrawnDocument, ExportedDocument } from './document';
export { createPageRouter } from './pages';
export type { Connection } from './socket';
export type { ServerMessage } from './protocol';
export { migrateTables } from './migrate';
export type { TablesReport } from './migrate';
