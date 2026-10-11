import type { CredentialAnswer, FeatureSeams } from '../feature';

// ═══════════════════════════════════════════════════════════════
// WHO AN INTEGRATION IS when it acts and nobody is driving.
//
// A webhook lands, a nightly sync runs: the integration presents the key it
// was issued and names who it acts for (`x-nisc-acts-for` — a tenant in most
// apps, and opaque here for the same reason scope values are). The key
// resolves through the registry (hash match, approved only) to a principal
// the APP names — and from that line on nothing downstream can tell it from a
// person: same policy compilation, same scope values, same engine stamping its
// writes. Deleting the integration is what revokes it; there is no second
// mechanism to forget.
// ═══════════════════════════════════════════════════════════════

// The prefix every key is minted with (./credentials.ts): what lets the
// server's authentication hand a token here without guessing.
export const KEY_PREFIX = 'ik_';

// The app's answer to "which principal is this integration, acting for that":
// `integrationActor` in the feature's configuration (./feature.ts).
export type IntegrationActor = (integration: string, actsFor: string) => string | null | Promise<string | null>;

const NO_ACTOR: CredentialAnswer = { refused: { status: 403, error: 'no_actor', message: 'This integration has no actor there.' } };

export const keyCredential =
  (deps: {
    // The approved integration a presented key belongs to (./registry.ts).
    byKey: (key: string) => Promise<string | undefined>;
    actor: IntegrationActor | undefined;
    resolveIdentity: FeatureSeams['resolveIdentity'];
  }) =>
  async (token: string, request: Request): Promise<CredentialAnswer> => {
    const integration = await deps.byKey(token);
    if (integration === undefined) return { refused: { status: 401, error: 'invalid_key', message: 'The integration key did not resolve.' } };
    const actor = (await deps.actor?.(integration, request.headers.get('x-nisc-acts-for') ?? '')) ?? null;
    if (actor === null) return NO_ACTOR;
    // The app's answer may be PURE (composing the actor id from its parts) —
    // whether the install is live is identity's question, so an actor that
    // resolves to nobody is refused here, where null used to be.
    const resolved = await deps.resolveIdentity(actor);
    if (resolved.roles.length === 1 && resolved.roles[0] === 'public') return NO_ACTOR;
    return { principal: actor };
  };
