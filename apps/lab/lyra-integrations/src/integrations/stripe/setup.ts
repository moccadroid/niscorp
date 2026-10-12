import type Stripe from 'stripe';

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

export const listDestinations = async (stripe: Stripe): Promise<Destination[]> => {
  const answer = (await stripe.rawRequest('GET', '/v2/core/event_destinations?include=webhook_endpoint.url', undefined, {
    apiVersion: '2026-07-29.dahlia',
  })) as unknown as { data?: Destination[] };
  return answer.data ?? [];
};

// `events_from: ['@accounts']`: subscriptions and invoices happen on the
// studios' accounts, and the default `@self` delivers only the platform's own
// events. The signing secret comes back once, and only when `include` names it.
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
      // Snapshot, so the payload carries the object rather than just its id.
      event_payload: 'snapshot',
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
