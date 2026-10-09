// ═══════════════════════════════════════════════════════════════
// A feature, and the seams it is started with.
//
// Moss answers five questions about a request, and each has one module that
// owns it. A feature owns none of them: integrations, say, are services that
// add screens. It lives in a directory of its own, ships from an entry point
// of its own, and the core never imports it. What it needs of the core it is
// handed (./seams.ts), by the server, when the server starts it.
//
// This module is two types and no code. It imports `runtime`, and nothing else
// of moss; the manifest imports it, to say what `NiscApp.features` holds.
// ═══════════════════════════════════════════════════════════════

export type { CredentialAnswer, Feature, FeatureEnv, FeatureSeams, Whoever } from './seams';
