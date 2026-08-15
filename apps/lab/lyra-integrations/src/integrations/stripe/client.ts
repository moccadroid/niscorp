import Stripe from 'stripe';
import type { IntegrationEnv } from '../../integration';

// ═══════════════════════════════════════════════════════════════
// THE ONLY FILE IN THIS WORKSPACE THAT IMPORTS THE STRIPE SDK.
//
// Not a style rule. Lyra validates every layout against a fixed component
// vocabulary and every action against a fixed set of endpoints — a host that
// imported a payment provider's SDK would carry that dependency into every app
// that ever installs this integration, and `frame-check` asserts it never does. Keeping
// the import to one file here is the same discipline one level down: the rest of
// the integration talks about accounts and sessions, not about a vendor's client.
//
// THE API VERSION IS PINNED AND EXPLICIT. Stripe's v2 surfaces refuse a request
// with no version header outright — a bare `/v2/core/...` call answers 400, "You
// did not provide an API version" — so this is load-bearing rather than tidy.
// Verified against the live sandbox: 2026-07-29.dahlia serves both the v2
// Accounts API and v1 Account Sessions.
const API_VERSION = '2026-07-29.dahlia';

// READ PER CALL, not at import. An operator pastes a key and restarts; a check
// sets one after boot without restarting a process it holds. The same reason
// `identity.ts` reads its verify key per request.
export const stripeFor = (env: IntegrationEnv): Stripe | undefined => {
  const secret = env('STRIPE_SECRET');
  if (secret === '') return undefined;
  return new Stripe(secret, { apiVersion: API_VERSION as Stripe.LatestApiVersion });
};

// ── WHAT A STUDIO'S ACCOUNT IS, and why it is this shape ─────
//
// S1's intent, in the API that actually exists. The decision names were written
// against Accounts v1; Stripe's own guidance is that a new platform builds on
// v2, so these are the v2 spellings of the same four choices:
//
//   dashboard: 'none'          — studios never visit stripe.com. IMMUTABLE:
//                                changing it means a NEW account object, which
//                                in live would strand the studio.
//   losses_collector: 'stripe' — Stripe carries negative balances, monitors for
//                                credit and fraud risk, and runs remediation.
//                                This is what COMPELS the three embedded
//                                components (onboarding, account management,
//                                notification banner) — they are a conditional
//                                requirement attached to that liability, not a
//                                preference. Taking liability ourselves would
//                                remove them and hand this platform a risk desk.
//   fees_collector: 'stripe'   — Stripe takes its fees from the connected
//                                account. Stripe refuses `application` losses
//                                with `stripe` fees, so these two travel together.
//
// The country is the STUDIO'S, not the platform's: an Austrian studio is an
// Austrian merchant, and the entity type decides which verification fields
// Stripe will ask that studio for.
export type OnboardArgs = { studioName: string; country: string; email?: string };

export const createConnectedAccount = async (stripe: Stripe, args: OnboardArgs): Promise<string> => {
  const account = await stripe.v2.core.accounts.create({
    display_name: args.studioName,
    ...(args.email !== undefined && args.email !== '' ? { contact_email: args.email } : {}),
    identity: { country: args.country.toLowerCase(), entity_type: 'company' },
    configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
    defaults: { responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' } },
    dashboard: 'none',
  } as Parameters<typeof stripe.v2.core.accounts.create>[0]);
  return account.id;
};

// ── HOSTED ONBOARDING, which is the one that WORKS TODAY ─────
//
// The embedded onboarding component (below) needs the PLATFORM's Connect
// embedded-components profile configured before Stripe will render it — a
// one-time setup that is not done here, so the embed comes back with an
// `api_error` and a blank frame. Verified against the sandbox: the connected
// account is fully onboardable, and an Account Link produces a working hosted
// form for it right now, with no platform-side setup at all.
//
// So this is the owner's real path to entering their business details: a
// short-lived redirect to Stripe's own hosted onboarding, back to lyra when
// done. It is "hosted" rather than "embedded" — a redirect off lyra — which S1
// held at arm's length, but a working redirect beats an embed nobody can fill.
// The embed becomes the default the day the platform profile is set up; nothing
// here has to change for that.
export const createOnboardingLink = async (stripe: Stripe, accountId: string, returnUrl: string): Promise<string> => {
  const link = await stripe.accountLinks.create({
    account: accountId,
    // Both point back at lyra: `refresh` is where an expired link sends the
    // owner to get a fresh one, `return` is where a finished one lands. The integration
    // does not choose these — they are the host's address (index.ts).
    refresh_url: returnUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
  return link.url;
};

// ── THE SERVER-SIDE GRANT FOR THE EMBEDDED UI ────────────────
//
// STILL v1. Stripe is mid-migration and the namespaces do not move together:
// accounts are v2, account sessions are `/v1/account_sessions`. Verified live
// against a v2-created account — the id space is shared, so a v2 account takes a
// v1 session and all three components enable.
//
// A component NOT named here cannot render, whatever the page asks for. The
// session is short-lived, so the page refreshes it rather than holding one.
const COMPELLED = ['account_onboarding', 'account_management', 'notification_banner'] as const;

export const createAccountSession = async (stripe: Stripe, accountId: string): Promise<string> => {
  const session = await stripe.accountSessions.create({
    account: accountId,
    components: Object.fromEntries(COMPELLED.map((name) => [name, { enabled: true }])) as Stripe.AccountSessionCreateParams.Components,
  });
  return session.client_secret;
};

// ── WHERE THE STUDIO STANDS, in the one detail that changes what the screen
//    should offer: is the ball in the STUDIO's court, or Stripe's? ──────────
//
// Reading only `card_payments.status` (active/restricted) could not tell those
// apart, so the screen offered "Enter business details" even when there was
// nothing for the owner to do — they clicked, Stripe had no step for them, and
// bounced them straight back. That is the "opens and closes" they saw.
//
// Stripe says it plainly: each requirement entry names `awaiting_action_from`.
// `user` means the studio must fill something; `stripe` means Stripe is
// reviewing and the owner should wait. So three states, not two.
export type AccountState = 'ready' | 'needs_info' | 'in_review';

export const accountStanding = async (
  stripe: Stripe,
  accountId: string,
): Promise<{ state: AccountState; ready: boolean; detail: string; actionable: number }> => {
  // The v2 include is repeated-key, not comma-joined — a comma is an
  // "unrecognized enum value" and the whole call 400s.
  const account = (await stripe.rawRequest(
    'GET',
    `/v2/core/accounts/${accountId}?include=requirements&include=configuration.merchant`,
    undefined,
    { apiVersion: '2026-07-29.dahlia' },
  )) as unknown as {
    configuration?: { merchant?: { capabilities?: { card_payments?: { status?: string } } } };
    requirements?: { entries?: { awaiting_action_from?: string }[] };
  };

  const status = account.configuration?.merchant?.capabilities?.card_payments?.status ?? 'unknown';
  const entries = account.requirements?.entries ?? [];
  const actionable = entries.filter((e) => e.awaiting_action_from === 'user').length;

  if (status === 'active') return { state: 'ready', ready: true, detail: 'Ready to take payments.', actionable: 0 };
  if (actionable > 0)
    return {
      state: 'needs_info',
      ready: false,
      detail: `Stripe needs ${actionable === 1 ? 'one more detail' : `${actionable} more details`} from this studio before it can take payments.`,
      actionable,
    };
  // Not active, but nothing is waiting on the studio: Stripe is reviewing what
  // was sent. Offering a button here is what sent the owner in a circle.
  return { state: 'in_review', ready: false, detail: 'Stripe is reviewing what you sent — nothing to do right now. This can take a little while.', actionable: 0 };
};
