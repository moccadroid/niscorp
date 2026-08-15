import { addDomain, checkDomain, readEvent, send } from './client';
import type { DomainState, MailEvent, Registered, Sent } from './client';

// ═══════════════════════════════════════════════════════════════
// MAIL — THE WHOLE OF IT, AND IT IS ONE VERB.
//
// THIS MODULE TOUCHES NO DATABASE. It takes a finished message and hands back
// an outcome. No pool, no vex, no identity, no retries, no scheduling, no
// templating.
//
// That is possible because everything else is already solved somewhere better:
// WHO to write to and IN WHOSE NAME is a vex selection running as the studio's
// own automation principal; WHETHER THEY CONSENTED is a filter in that same
// selection; RETRY AND IDEMPOTENCY are the tide task; WHAT THE WORDS ARE is a
// column somebody typed. The only thing left with no home is "put this text in
// front of that human", and that genuinely is one function.
//
// KEEP IT THAT WAY. The day this file can read the database it will start
// resolving recipients, and then it will need tenancy, and then mail is a
// subsystem rather than a file. Every one of those steps looks reasonable on
// its own; the rule is what makes them visible.
//
// TWO CALLERS, EVER: the sign-in link (auth.ts) and the automation effect. A
// module with two callers cannot spread. `mail-check` holds the other two
// fences — the vendor's name in one file, `MAIL_*` read in one file.
// ═══════════════════════════════════════════════════════════════

export type Message = {
  to: string;
  /** The display name a member sees — the studio's, or Lyra's for a sign-in. */
  fromName: string;
  /** The local part before our domain: a studio's slug, or `no-reply`.
   *  Sanitised below, because it is the one part of the sender a caller
   *  influences at all. */
  fromBox: string;
  /** Where a reply goes. The studio's own address — empty for platform mail,
   *  because nobody should be able to reply to a sign-in link. */
  replyTo: string;
  subject: string;
  text: string;
  /** This message's identity: the outbox row's id, or the sign-in token. */
  key: string;
  /** The studio's OWN verified domain, when it has one. Empty is the shared
   *  deployment domain, which is what everybody sends from until they decide
   *  otherwise. It is still not a free-text sender: it is sanitised to a
   *  hostname here, and it only reaches this field from a row an owner can set
   *  and the PROVIDER has verified — an unverified one never gets written. */
  fromDomain?: string;
  headers?: Record<string, string>;
};

export type { Sent };

// A HEADER IS ONE LINE. A newline inside a display name, a subject or a
// reply-to is not a formatting quirk — it ends the header and starts another
// one of the caller's choosing, which is how a message acquires a second
// recipient nobody authored. The body is exempt: it is the one field where a
// newline means a newline.
const header = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim();

// The sender is OURS. A caller supplies a name and a box; the domain is the
// deployment's, the shape is fixed here, and there is no field anywhere in
// `Message` that can carry an `@`. Nothing a studio types can move the address
// its mail appears to come from.
const BOX = /[^a-z0-9-]/g;
const HOST = /^[a-z0-9.-]+\.[a-z]{2,}$/;
const senderFrom = (message: Message, domain: string): string => {
  const box = message.fromBox.toLowerCase().replace(BOX, '');
  const name = header(message.fromName).replace(/["\\]/g, '');
  return `"${name}" <${box === '' ? 'no-reply' : box}@${domain}>`;
};

const looksLikeAddress = (value: string): boolean => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(header(value));

/**
 * Send one message. Never throws: a failure is a value, because every caller
 * has somewhere honest to put one — a column on the outbox row, or a line in
 * the log beside the sign-in link that did not go anywhere.
 */
export const sendMail = async (message: Message): Promise<Sent> => {
  // None of the three below are worth trying again thirty seconds later: an
  // address is not going to become valid, and a key nobody has pasted yet is
  // not going to appear inside one task's retry window. They are states to
  // show somebody, which is what `retry: false` means here.
  if (!looksLikeAddress(message.to)) return { ok: false, reason: 'that is not an email address', retry: false };

  // READ PER CALL, never at import. An operator pastes a key and restarts the
  // process; a check sets one after boot without restarting a process it is
  // holding. The same reason the identity layer reads its verify key per
  // request rather than closing over it.
  const sink = process.env['MAIL_SINK'] ?? '';
  const secret = process.env['MAIL_PROVIDER_KEY'] ?? '';
  const domain = process.env['MAIL_FROM_DOMAIN'] ?? '';

  const own = (message.fromDomain ?? '').toLowerCase().trim();
  const sending = HOST.test(own) ? own : domain;
  const from = senderFrom(message, sending === '' ? 'localhost' : sending);
  const envelope = {
    from,
    to: header(message.to),
    replyTo: looksLikeAddress(message.replyTo) ? header(message.replyTo) : '',
    subject: header(message.subject),
    text: message.text,
    key: message.key,
    ...(message.headers === undefined ? {} : { headers: message.headers }),
  };

  // THE LAB'S TRANSPORT, and it is off unless somebody names it — same posture
  // as `LYRA_DEV_INTEGRATIONS`. A development database is replayed from seed on every
  // save, so an automation that can never report anything but `Failed` teaches
  // nobody anything about whether the automation worked. This makes the mail
  // VISIBLE without making it SENT, and the id says which it was: a row reading
  // `sink_…` on a screen is not a claim that anybody received something.
  if (sink === 'log') {
    console.log(`\n[lyra:mail] ${envelope.from} → ${envelope.to}\n  ${envelope.subject}\n  ${envelope.text.replace(/\n/g, '\n  ')}\n`);
    return { ok: true, id: `sink_${message.key}` };
  }

  // A MISSING SECRET IS A VISIBLE STATE — never a crash, and never a silent
  // success. The same posture the payments integration takes about having no key: the
  // row says `Failed`, the reason says why in words, and the screen shows it.
  if (secret === '') return { ok: false, reason: 'no provider configured', retry: false };
  if (sending === '') return { ok: false, reason: 'no sending domain configured', retry: false };

  return send(secret, envelope);
};

/**
 * What the provider says happened AFTERWARDS — verified, or nothing.
 *
 * Here rather than in the route for the same reason the key is: this file is
 * the only one that reads `MAIL_*`, and the route has no business knowing
 * there is a secret involved. Here rather than in client.ts for the same
 * reason `send` takes its secret as an argument: the vendor's dialect is one
 * file, the deployment's configuration is another.
 */
export const readMailEvent = (headers: Record<string, string>, rawBody: string, now: number): MailEvent | null =>
  readEvent(process.env['MAIL_HOOK_SECRET'] ?? '', headers, rawBody, now);

export type { MailEvent, DnsRecord, Registered, DomainState } from './client';

/** The domain a message would actually leave from, for a screen that wants to
 *  show a studio its own sender. Here because this file is the only one that
 *  reads `MAIL_*`, and a screen inventing the answer is a screen that lies the
 *  day a deployment changes it. */
export const sendingDomain = (): string => process.env['MAIL_FROM_DOMAIN'] ?? '';

/** Register a studio's own domain, or say why not. Same posture as sending: a
 *  missing key is a sentence somebody can read, not a crash. */
export const registerDomain = async (domain: string): Promise<Registered> => {
  const secret = process.env['MAIL_PROVIDER_KEY'] ?? '';
  if (secret === '') return { ok: false, reason: 'no provider configured' };
  return addDomain(secret, domain);
};

export const domainState = async (id: string): Promise<DomainState> => {
  const secret = process.env['MAIL_PROVIDER_KEY'] ?? '';
  if (secret === '') return { ok: false, reason: 'no provider configured' };
  return checkDomain(secret, id);
};

/** `Name <slug@domain>` — composed by the same rule the envelope is, so what a
 *  studio reads on the settings screen is what a member reads in their inbox. */
export const senderFor = (name: string, slug: string): string => {
  const domain = sendingDomain();
  return domain === '' ? `${name} <not configured>` : `${name} <${slug.toLowerCase().replace(BOX, '')}@${domain}>`;
};
