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
export type { NiscApp, ShellManifest, FunctionSession, LayoutVariant, RunRecord, RunTurn, RunSink } from './app';
export { devSession, mintDevToken } from './runtime';
export type { NiscRuntime, SessionVerifier } from './runtime';
export { emitterOf, spanClock } from './telemetry';
export type { Telemetry, TelemetrySpan, Emit, SpanClock } from './telemetry';
export { initSessions, mintSession, sessionOf, revokeSession, revokeAllFor, sessionVerifierOf } from './sessions';
export { createServer } from './server';
export type { MossServer, ExecuteAs } from './server';
export { runIntake, copyPress, callIntegrationWith, initIntegrations, listIntegrations, loadIntegrationActions, integrationOfAction, integrationByKey, filterInstalled, buildContract, contractAsMarkdown, describePlacements, listAttachments, listPlacements } from './integrations';
export type { IntegrationRow, Bundle, IntakeResult, IntakeContext, Contract, StorePress, PressResult, CallIntegration } from './integrations';
export { createAssertionSigner, verifyAssertion, mintIntegrationKey, hashIntegrationKey } from './assert';
export type { Assertion, AssertionSigner } from './assert';
export { resolveRoles, resolvePolicy, resolvePolicyAtReach, resolveCatalog, resolveVariants, resolveCatalogForRoles, resolveVariantsForRoles, resolvePolicyForRoles, verifyVariants, wearableOf, memoKeyOf } from './principal';
export type { Catalog } from './principal';
export { createDataLayer } from './data';
export { createTideStore, TIDE_DDL, TIDE_TABLES, mintWrites } from './tide';
export type { TideStoreOptions } from './tide';
export { createTideDriver } from './driver';
export type { TideDriver, TideDriverConfig } from './driver';
export type { FactIntake } from './app';
export { auditClosure } from './closure';
export type { DataLayer } from './data';
export { createSocket, CLOSE_INVALID_TOKEN, CLOSE_SIGNED_OUT, CLOSE_SHELL_FAILED, DEFAULT_REVALIDATE_MS } from './socket';
export { createShellHost, DEFAULT_IDLE_MS } from './shells';
export { createIdentityCache, DEFAULT_IDENTITY_MAX, DEFAULT_IDENTITY_IDLE_MS } from './identity';
export { createGeneration, GENERATION_DDL, DEFAULT_GENERATION_POLL_MS } from './generation';
export type { Generation } from './generation';
export type { IdentityRecord, IdentityReport, IdentityCache, IdentityCacheContext } from './identity';
export type { ShellHost, ShellSession, ShellReport } from './shells';
export type { Connection, ServerMessage, ClientMessage, SocketAccept, SocketContext } from './socket';
