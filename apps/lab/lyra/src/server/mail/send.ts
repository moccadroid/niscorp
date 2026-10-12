import { addDomain, checkDomain, readEvent, send } from './client';
import type { DomainState, MailEvent, Registered, Sent } from './client';

export type Message = {
  to: string;
  fromName: string;
  fromBox: string;
  replyTo: string;
  subject: string;
  text: string;
  key: string;
  /** The studio's own domain, passed only once the provider has verified it.
   *  Empty is the shared deployment domain. */
  fromDomain?: string;
  headers?: Record<string, string>;
};

export type { Sent };

// A newline inside a display name, a subject or a reply-to ends the header and
// starts another one of the caller's choosing. The body is exempt.
const header = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim();

const BOX = /[^a-z0-9-]/g;
const HOST = /^[a-z0-9.-]+\.[a-z]{2,}$/;
const senderFrom = (message: Message, domain: string): string => {
  const box = message.fromBox.toLowerCase().replace(BOX, '');
  const name = header(message.fromName).replace(/["\\]/g, '');
  return `"${name}" <${box === '' ? 'no-reply' : box}@${domain}>`;
};

const looksLikeAddress = (value: string): boolean => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(header(value));

export const sendMail = async (message: Message): Promise<Sent> => {
  if (!looksLikeAddress(message.to)) return { ok: false, reason: 'that is not an email address', retry: false };

  // Read per call, never at import: a check sets these after boot.
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

  if (sink === 'log') {
    console.log(`\n[lyra:mail] ${envelope.from} → ${envelope.to}\n  ${envelope.subject}\n  ${envelope.text.replace(/\n/g, '\n  ')}\n`);
    return { ok: true, id: `sink_${message.key}` };
  }

  if (secret === '') return { ok: false, reason: 'no provider configured', retry: false };
  if (sending === '') return { ok: false, reason: 'no sending domain configured', retry: false };

  return send(secret, envelope);
};

export const readMailEvent = (headers: Record<string, string>, rawBody: string, now: number): MailEvent | null =>
  readEvent(process.env['MAIL_HOOK_SECRET'] ?? '', headers, rawBody, now);

export type { MailEvent, DnsRecord, Registered, DomainState } from './client';

export const sendingDomain = (): string => process.env['MAIL_FROM_DOMAIN'] ?? '';

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

export const senderFor = (name: string, slug: string): string => {
  const domain = sendingDomain();
  return domain === '' ? `${name} <not configured>` : `${name} <${slug.toLowerCase().replace(BOX, '')}@${domain}>`;
};
