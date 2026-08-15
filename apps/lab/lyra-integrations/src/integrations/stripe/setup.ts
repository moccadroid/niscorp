import type Stripe from 'stripe';

// ═══════════════════════════════════════════════════════════════
// SETUP IS A SCRIPT, NOT A DASHBOARD VISIT (S3).
//
// The dev account is disposable and the live platform does not exist yet — it
// gets created fresh under the real legal entity at go-live. So anything
// configured by clicking would have to be done twice and remembered in between,
// which is how a deployment ends up with a webhook nobody can account for.
//
// Everything here is idempotent: run it against a blank account and it
// configures one, run it against a configured one and it says so.
// ═══════════════════════════════════════════════════════════════

// The events this integration actually handles (hooks.ts). Asking for more would mean
// paying delivery attempts for events nothing acts on, and asking for fewer
// means a handler that never runs — so the list is the handler's, not a guess.
//
// SNAPSHOT, NOT THIN. These are v1 API events; `thin` is for v2 ones. The
// difference is not cosmetic — a thin payload carries an id and nothing else,
// and every handler here reads the object.
export const HANDLED_EVENTS = [
  'account.updated',
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
] as const;

const DESTINATION_NAME = 'lyra — memberships';

export type Destination = {
  id: string;
  name?: string;
  status?: string;
  webhook_endpoint?: { url?: string; signing_secret?: string | null };
};

/**
 * Every destination this platform has, so a second run can see the first.
 *
 * v2 lists do not page the way v1 does; one call is enough for the handful a
 * platform ever has, and pretending otherwise would be inventing a loop nobody
 * can trigger.
 */
export const listDestinations = async (stripe: Stripe): Promise<Destination[]> => {
  const answer = (await stripe.rawRequest('GET', '/v2/core/event_destinations?include=webhook_endpoint.url', undefined, {
    apiVersion: '2026-07-29.dahlia',
  })) as unknown as { data?: Destination[] };
  return answer.data ?? [];
};

/**
 * The webhook Stripe delivers to, made once.
 *
 * `events_from: ['@accounts']` IS THE WHOLE POINT and the easiest thing to get
 * wrong. Subscriptions and invoices happen on the STUDIOS' accounts, not on the
 * platform's — a destination left at the default `@self` receives the platform's
 * own events, which is to say almost nothing, and the failure looks exactly like
 * a webhook that was never called.
 *
 * THE SIGNING SECRET COMES BACK ONCE, and only if asked for by name. There is no
 * way to read it later: a lost secret means replacing the destination.
 */
export const ensureDestination = async (
  stripe: Stripe,
  url: string,
): Promise<{ created: boolean; destination: Destination; secret: string | undefined }> => {
  const existing = (await listDestinations(stripe)).find((d) => d.webhook_endpoint?.url === url || d.name === DESTINATION_NAME);
  if (existing !== undefined) return { created: false, destination: existing, secret: undefined };

  const destination = (await stripe.rawRequest(
    'POST',
    '/v2/core/event_destinations',
    {
      name: DESTINATION_NAME,
      description: 'Membership subscriptions, invoices and onboarding for studios on this platform.',
      type: 'webhook_endpoint',
      // v1 events, so the payload carries the object rather than just its id.
      event_payload: 'snapshot',
      // Pinned to the version this integration is written against, so a Stripe upgrade
      // does not silently change the shape of what arrives.
      snapshot_api_version: '2026-07-29.dahlia',
      events_from: ['@accounts'],
      enabled_events: [...HANDLED_EVENTS],
      webhook_endpoint: { url },
      include: ['webhook_endpoint.signing_secret', 'webhook_endpoint.url'],
    },
    { apiVersion: '2026-07-29.dahlia' },
  )) as unknown as Destination;

  return { created: true, destination, secret: destination.webhook_endpoint?.signing_secret ?? undefined };
};

export const deleteDestination = async (stripe: Stripe, id: string): Promise<void> => {
  await stripe.rawRequest('DELETE', `/v2/core/event_destinations/${id}`, undefined, { apiVersion: '2026-07-29.dahlia' });
};
