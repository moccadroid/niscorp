import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.resend.com/emails';

export type Envelope = {
  from: string;
  /** One recipient: a studio's member list is not disclosed in a To: header. */
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  key: string;
  headers?: Record<string, string>;
};

export type Sent = { ok: true; id: string } | { ok: false; reason: string; retry: boolean };

const because = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, 200);

export const send = async (secret: string, envelope: Envelope): Promise<Sent> => {
  try {
    const response = await fetch(API, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
        'idempotency-key': envelope.key,
      },
      body: JSON.stringify({
        from: envelope.from,
        to: [envelope.to],
        subject: envelope.subject,
        text: envelope.text,
        ...(envelope.replyTo === '' ? {} : { reply_to: envelope.replyTo }),
        ...(envelope.headers === undefined ? {} : { headers: envelope.headers }),
      }),
    });

    const body: unknown = await response.json().catch(() => null);
    const field = (name: string): string => {
      const value = body !== null && typeof body === 'object' ? (body as Record<string, unknown>)[name] : undefined;
      return typeof value === 'string' ? value : '';
    };

    if (!response.ok) {
      const message = field('message') !== '' ? field('message') : field('error');
      return {
        ok: false,
        reason: because(message !== '' ? message : `the mail provider refused (${response.status})`),
        retry: response.status >= 500 || response.status === 429,
      };
    }

    const id = field('id');
    // Not retryable: the message may well have gone, and sending again would
    // cost the person a second copy.
    return id === '' ? { ok: false, reason: 'the mail provider accepted it without an id', retry: false } : { ok: true, id };
  } catch (error) {
    return { ok: false, reason: because(`the mail provider is unreachable — ${String(error)}`), retry: true };
  }
};

// Resend delivers events through Svix, which signs `id.timestamp.body` over the
// raw body: HMAC-SHA256, keyed on the secret with its `whsec_` prefix stripped
// and the remainder base64-decoded. The signature header may carry several
// space-separated `v1,<base64>` tokens (key rotation); any one matching is valid.
export type MailEvent = { kind: 'delivered' | 'bounced' | 'complained' | 'other'; id: string; to: string; reason: string };

const TOLERANCE_MS = 5 * 60_000;

export const readEvent = (secret: string, headers: Record<string, string>, rawBody: string, now: number): MailEvent | null => {
  const id = headers['svix-id'] ?? '';
  const timestamp = headers['svix-timestamp'] ?? '';
  const offered = headers['svix-signature'] ?? '';
  if (secret === '' || id === '' || timestamp === '' || offered === '') return null;

  // A replay window, because a signature is valid forever. The tolerance is Svix's own.
  const at = Number(timestamp) * 1_000;
  if (!Number.isFinite(at) || Math.abs(now - at) > TOLERANCE_MS) return null;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  const matched = offered.split(' ').some((token) => {
    const value = token.startsWith('v1,') ? token.slice(3) : '';
    if (value.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  });
  if (!matched) return null;

  const body: unknown = JSON.parse(rawBody) as unknown;
  const read = (path: readonly string[]): string => {
    let at: unknown = body;
    for (const step of path) at = at !== null && typeof at === 'object' ? (at as Record<string, unknown>)[step] : undefined;
    return typeof at === 'string' ? at : '';
  };
  const type = read(['type']);
  const data = body !== null && typeof body === 'object' ? ((body as Record<string, unknown>)['data'] as Record<string, unknown> | undefined) : undefined;
  const raw = data?.['to'];
  const to = Array.isArray(raw) ? String(raw[0] ?? '') : typeof raw === 'string' ? raw : '';

  const kind = type === 'email.delivered' ? 'delivered' : type === 'email.bounced' ? 'bounced' : type === 'email.complained' ? 'complained' : 'other';
  return { kind, id: read(['data', 'email_id']), to, reason: because(read(['data', 'bounce', 'message']) || type) };
};

export type DnsRecord = { record: string; name: string; type: string; value: string; ttl: string; priority?: number };
export type Registered = { ok: true; id: string; records: DnsRecord[] } | { ok: false; reason: string };
export type DomainState = { ok: true; verified: boolean; status: string } | { ok: false; reason: string };

const DOMAINS = 'https://api.resend.com/domains';

const domainRecords = (body: unknown): DnsRecord[] => {
  const raw = body !== null && typeof body === 'object' ? (body as Record<string, unknown>)['records'] : undefined;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const r = (entry ?? {}) as Record<string, unknown>;
    return {
      record: String(r['record'] ?? ''),
      name: String(r['name'] ?? ''),
      type: String(r['type'] ?? ''),
      value: String(r['value'] ?? ''),
      ttl: String(r['ttl'] ?? 'Auto'),
      ...(typeof r['priority'] === 'number' ? { priority: r['priority'] } : {}),
    };
  });
};

const said = async (response: Response): Promise<string> => {
  const body: unknown = await response.json().catch(() => null);
  const message = body !== null && typeof body === 'object' ? (body as Record<string, unknown>)['message'] : undefined;
  return because(typeof message === 'string' && message !== '' ? message : `the mail provider refused (${response.status})`);
};

export const addDomain = async (secret: string, domain: string): Promise<Registered> => {
  try {
    const response = await fetch(DOMAINS, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: domain }),
    });
    if (!response.ok) return { ok: false, reason: await said(response) };
    const body: unknown = await response.json().catch(() => null);
    const id = body !== null && typeof body === 'object' ? String((body as Record<string, unknown>)['id'] ?? '') : '';
    return id === '' ? { ok: false, reason: 'the provider registered it without an id' } : { ok: true, id, records: domainRecords(body) };
  } catch (error) {
    return { ok: false, reason: because(`the mail provider is unreachable — ${String(error)}`) };
  }
};

/** The provider's verify call is asynchronous and moves the domain to `pending`
 *  whatever it was, so the state comes from the read that follows. */
export const checkDomain = async (secret: string, id: string): Promise<DomainState> => {
  try {
    const auth = { authorization: `Bearer ${secret}` };
    await fetch(`${DOMAINS}/${id}/verify`, { method: 'POST', headers: auth }).catch(() => undefined);
    const response = await fetch(`${DOMAINS}/${id}`, { headers: auth });
    if (!response.ok) return { ok: false, reason: await said(response) };
    const body: unknown = await response.json().catch(() => null);
    const status = body !== null && typeof body === 'object' ? String((body as Record<string, unknown>)['status'] ?? '') : '';
    return { ok: true, verified: status === 'verified', status };
  } catch (error) {
    return { ok: false, reason: because(`the mail provider is unreachable — ${String(error)}`) };
  }
};
