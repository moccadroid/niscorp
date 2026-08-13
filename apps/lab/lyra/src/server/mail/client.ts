// ═══════════════════════════════════════════════════════════════
// THE ONLY FILE IN THIS APP THAT KNOWS WHO SENDS THE MAIL.
//
// Not a style rule. Mail is the one dependency that reaches every corner of a
// product — a provider's name in the reflex, in the auth path, in a screen, in
// a test fixture — and by the time anybody notices, "swap the provider" is a
// refactor rather than a file. So the vendor lives here, behind two types, and
// `mail-check` asserts the name appears in exactly one file under src/.
//
// SWAPPING PROVIDERS IS REPLACING THIS FILE. Everything above it speaks
// `Envelope` in and `Sent` out; nothing above it has ever seen an HTTP status,
// a vendor's error shape, or a field name. If a provider type escapes into
// send.ts, the abstraction has already failed.
//
// WHAT WE ASK A MAIL VENDOR TO DO — the complete list, so that the three not
// yet built land HERE and not at whatever call site needs them first:
//
//   send(secret, envelope)         → Sent            ← the only one built
//   readEvent(secret, headers, body) → Event | null  ← BUILT (bottom of file)
//   addDomain(secret, domain)      → Registered       ← BUILT (bottom of file)
//   checkDomain(secret, id)        → DomainState      ← BUILT (bottom of file)
//
// THIS FILE READS NO ENVIRONMENT AND HOLDS NO STATE. The secret arrives as an
// argument, because deciding whether we are configured to send is policy and
// policy lives in send.ts. Here there is only a vendor's dialect.
// ═══════════════════════════════════════════════════════════════

import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.resend.com/emails';

/** Exactly what goes on the wire — already composed, already sanitised. */
export type Envelope = {
  /** `Studio Name <box@domain>`. Built by send.ts; never by a caller. */
  from: string;
  /** ONE recipient. A studio's member list is not something to disclose in a
   *  To: header, and one message per person is what makes a per-message task
   *  retry independently — see the reflex. */
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  /** This message's identity, for the provider's own duplicate refusal. */
  key: string;
  /** Anything else the message needs on the wire — `List-Unsubscribe`, when
   *  consent lands. Kept generic so a header is never a reason to edit this. */
  headers?: Record<string, string>;
};

// WILL TRYING AGAIN HELP? The one judgement this layer makes, and it belongs
// here because only the vendor's answer can settle it: a refused address will
// be refused again, an unreachable host might not be. `retry` is OUR word for
// it — the caller never learns what status code produced it — and it is what
// decides whether the outbox row goes back in the queue or stops at `failed`.
export type Sent = { ok: true; id: string } | { ok: false; reason: string; retry: boolean };

// THE PROVIDER'S WORDS, NOT OURS. A failure reason is read by a studio owner
// on the Outbox screen and by whoever they forward it to, so it says what the
// provider said — bounded, because an error page pasted into a table cell is
// not a reason.
const because = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, 200);

export const send = async (secret: string, envelope: Envelope): Promise<Sent> => {
  try {
    const response = await fetch(API, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
        // A SECOND LINE OF DEFENCE, never the only one. The claim on the outbox
        // row (`queued → sending`) is what actually prevents a double send;
        // this refuses one that got past it — a send that succeeded and whose
        // acknowledgement we never heard. A provider without this header is
        // still a provider we can use.
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
      // Every provider has a message field and they are all called something
      // different; a bare status code tells a studio nothing.
      const message = field('message') !== '' ? field('message') : field('error');
      return {
        ok: false,
        reason: because(message !== '' ? message : `the mail provider refused (${response.status})`),
        // Their fault or ours: a 5xx is a bad minute at the provider and a 429
        // is a queue asking us to wait. A 4xx is a message that will be refused
        // in exactly the same words in thirty seconds' time.
        retry: response.status >= 500 || response.status === 429,
      };
    }

    const id = field('id');
    // ACCEPTED WITHOUT AN ID IS NOT ACCEPTED. Recording `sent` with nothing to
    // look up is the state that cannot be supported later — the whole reason
    // the column exists is the morning somebody asks where their mail went.
    // Not retryable: it may well have gone, and sending again to find out is
    // the one repair that costs a person a second copy.
    return id === '' ? { ok: false, reason: 'the mail provider accepted it without an id', retry: false } : { ok: true, id };
  } catch (error) {
    // Unreachable is an ordinary condition, not an exception: the row says so,
    // the screen shows it, and tide tries the task again.
    return { ok: false, reason: because(`the mail provider is unreachable — ${String(error)}`), retry: true };
  }
};

// ── WHAT THE PROVIDER TELLS US AFTERWARDS ────────────────────
//
// A 200 from `send` means ACCEPTED, not delivered — proven the hard way: this
// provider took a message from a sender it had every reason to refuse, gave
// back an id, and delivered it. So the only thing that can make the word
// "Sent" on a studio's screen true is the provider saying what happened next.
//
// Resend delivers these through Svix, which signs three headers over the RAW
// body: `svix-id`, `svix-timestamp`, `svix-signature`. The signed content is
// `id.timestamp.body`, HMAC-SHA256, keyed on the signing secret with its
// `whsec_` prefix stripped and the remainder base64-DECODED — that last part
// is the one everybody gets wrong, and getting it wrong fails closed and
// silently, which is the worst way for a security check to be broken.
//
// The header may carry several space-separated `v1,<base64>` tokens (key
// rotation); any one matching is valid.
export type MailEvent = { kind: 'delivered' | 'bounced' | 'complained' | 'other'; id: string; to: string; reason: string };

const TOLERANCE_MS = 5 * 60_000;

export const readEvent = (secret: string, headers: Record<string, string>, rawBody: string, now: number): MailEvent | null => {
  const id = headers['svix-id'] ?? '';
  const timestamp = headers['svix-timestamp'] ?? '';
  const offered = headers['svix-signature'] ?? '';
  if (secret === '' || id === '' || timestamp === '' || offered === '') return null;

  // A REPLAY WINDOW, because a signature is valid forever and a recording of
  // one request IS that request. Five minutes is Svix's own tolerance.
  const at = Number(timestamp) * 1_000;
  if (!Number.isFinite(at) || Math.abs(now - at) > TOLERANCE_MS) return null;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  const matched = offered.split(' ').some((token) => {
    const value = token.startsWith('v1,') ? token.slice(3) : '';
    if (value.length !== expected.length) return false;
    // Constant time: a comparison that returns early tells a forger how much
    // of their guess was right.
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

// ── A STUDIO'S OWN DOMAIN ────────────────────────────────────
//
// The shared sending domain is what makes a studio able to send on the day it
// is created. This is the upgrade for the ones that outgrow it: their mail
// leaves as `hallo@theirstudio.at`, which is better for their members and — on
// a domain nobody else can spend — better for everybody's deliverability.
//
// TWO CALLS AND A WAIT. Registering hands back the DNS records somebody has to
// publish; verification is asynchronous on the provider's side, so asking is a
// separate act and the answer is a STATE rather than a yes. Nothing here
// writes anything down: the caller records what the provider said, and until
// it says `verified` the shared sender stays in use.
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

/** Asks the provider to LOOK, then reports what it currently believes. The
 *  verify call is asynchronous — it moves the domain to `pending` whatever it
 *  was — so the state comes from the read that follows, and a studio pressing
 *  the button twice is somebody asking again rather than a mistake. */
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
