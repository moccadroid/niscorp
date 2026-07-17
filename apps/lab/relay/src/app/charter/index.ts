// Relay's charter ARTIFACTS — the documents @niscorp/charter resolves.
// The engine lives in the package (zero deps, universe-blind); this module
// is the app's policy CONTENT: which roles exist, what they select, who
// wears them. Nothing compiles here: moss derives per-principal policy
// and catalogs from src/relay.ts; the trusted dev path's engine default
// (Ray's) lives in ray/engine.ts.
export { CHARTER } from './charter';
export { ASSIGNMENTS } from './assignments';
