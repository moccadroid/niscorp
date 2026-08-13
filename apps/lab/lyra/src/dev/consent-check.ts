// Run: pnpm --filter lyra exec tsx src/dev/consent-check.ts
//
// CONSENT, AND THE DOOR OUT OF IT.
//
// Lyra's studios trade in AT/DE, where the line is not about tone: a class
// reminder is contractual — they booked the class — and "we have missed you"
// is marketing however warmly it is worded. Marketing needs consent given to
// THE STUDIO, and a way out that works from an email, on a phone, years later,
// for somebody who has forgotten they ever had an account.
//
// So four claims: the opt-in is part of the question rather than a filter
// somebody remembers; the way out needs no session; a forged way out is not a
// way in; and the mail that needs a footer has one while the mail that does
// not, does not.
process.env['MAIL_SINK'] = 'log';
// Set HERE rather than read from a developer's .env: a check that passes only
// on the machine that happens to hold a secret is a check that says nothing.
process.env['LYRA_SIGNING_SEED'] = 'consent-check-seed';
process.env['MAIL_FROM_DOMAIN'] = 'mail.lyra.test';

import { CAST } from '@lyra/db/seed';
import { asPrincipal, login, ok, report, runtime, server, settle, treeOf } from './world';
import { unsubscribeToken } from '@lyra/server/unsubscribe';
import { sendMail } from '@lyra/server/mail/send';

const consent = async (): Promise<boolean> => {
  const r = await runtime.db.query<{ marketing_ok: boolean }>("SELECT marketing_ok FROM studio_people WHERE id = 'sp_ava'");
  return r.rows[0]?.marketing_ok === true;
};

// `async` because `server.request` may answer synchronously — the declared
// `Promise<Response>` was a claim about a union, and every caller awaits anyway.
const knock = async (token: string, method = 'GET'): Promise<Response> => await server.request(`/api/unsubscribe/${token}`, { method });

// ── the way out ──────────────────────────────────────────────
ok('somebody who opted in is on the list', await consent(), 'Ava said yes when she joined');

const token = unsubscribeToken('st_lumen', 'p_ava');
const page = await knock(token);
const said = await page.text();
ok('a footer link needs no session at all', page.status === 200, `${page.status} — nobody clicking this is signed in, and years may have passed`);
ok('...and answers in words a person can read', said.includes('<p>') && !said.includes('{'), 'the one surface in this app reached without a shell');
ok('...and it took them off', !(await consent()), 'one column, one row');

// ONE-CLICK is a POST, issued by the mailbox provider rather than the person —
// Gmail and Yahoo both do this from the List-Unsubscribe-Post header. A door
// that only opened for GET would look fine to a human and fail for the client
// that actually protects the sending domain.
await asPrincipal(CAST.lumen.owner, '/api/member/vex', { fingerprint: 'people/consent', context: { personId: 'p_ava', marketingOk: true } });
ok('...and the same door takes a one-click POST', (await knock(token, 'POST')).status === 200 && !(await consent()), 'the provider clicks it, not the person');

// ── and the ones that are not doors ──────────────────────────
await asPrincipal(CAST.lumen.owner, '/api/member/vex', { fingerprint: 'people/consent', context: { personId: 'p_ava', marketingOk: true } });
const forged = await knock('st_lumen.p_ava.notarealsignatureatall');
ok('a forged signature changes nothing', forged.status === 200 && (await consent()), 'answers politely and does nothing — a 403 would confirm the guess');
const wrongStudio = await knock(unsubscribeToken('st_northrock', 'p_ava'));
ok('...and a token minted for another studio is not this one', wrongStudio.status === 200 && (await consent()), 'consent is per studio, so the signature is too');

// ── what goes on the wire ────────────────────────────────────
//
// The footer and the headers are added at the transport, not written into the
// studio's words — a studio composing its own opt-out is a studio that can
// forget to. Captured from the sink, which prints exactly what would be sent.
const said2: string[] = [];
const spoke = console.log;
console.log = (...parts: unknown[]) => void said2.push(parts.map(String).join(' '));
await sendMail({ to: 'a@example.com', fromName: 'Lumen Yoga', fromBox: 'lumen', replyTo: '', subject: 'Reminder', text: 'Class tomorrow at 18:30.', key: 'k1' });
await sendMail({
  to: 'a@example.com', fromName: 'Lumen Yoga', fromBox: 'lumen', replyTo: '', subject: 'We have missed you', text: 'Come back.', key: 'k2',
  headers: { 'List-Unsubscribe': '<https://lyra.test/api/unsubscribe/x>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
});
console.log = spoke;
ok('a class reminder carries no opt-out', !(said2[0] ?? '').includes('unsubscribe'), 'it is not marketing, and teaching people to expect one everywhere is how they stop reading them');
ok('...while a win-back carries one', (said2[1] ?? '').includes('missed you'), 'the moment declares it; the row carries it; the wire shows it');

// ── WHERE A YES IS RECORDED ──────────────────────────────────
//
// Consent that can only be TAKEN AWAY is not consent — until this screen
// existed, a studio's win-back automation reached nobody and there was no way
// to change that. The desk asks at the counter, and the switch saves on the
// flip rather than on Save: somebody who says yes and walks away should not
// depend on anybody pressing a button afterwards.
const desk = await login(CAST.lumen.desk);
await settle(10);
desk.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
await settle(14);
desk.dispatch({ type: 'ui:click', ref: 'open', payload: { person_id: 'p_jonas' } });
await settle(14);
desk.dispatch({ type: 'ui:click', ref: 'edit' });
await settle(14);
const form = treeOf(desk);
ok('the desk can be asked to record a yes', form.includes('May we email them news and offers?'), 'on the person’s own record, where the question gets asked');

desk.dispatch({ type: 'ui:model', ref: 'marketingOk', payload: true });
await settle(16);
const jonas = await runtime.db.query<{ marketing_ok: boolean }>("SELECT marketing_ok FROM studio_people WHERE id = 'sp_jonas'");
ok('...and flipping it is the save', jonas.rows[0]?.marketing_ok === true, 'no button between somebody saying yes and it being written down');
await asPrincipal(CAST.lumen.owner, '/api/member/vex', { fingerprint: 'people/consent', context: { personId: 'p_jonas', marketingOk: false } });

// ── WHERE A REPLY COMES BACK TO ──────────────────────────────
//
// The other half of the studio's relationship with a recipient, and the one
// thing a studio must tell us: mail leaves from a shared domain wearing their
// name, so this header is all that points home. Seeded for the demo studios —
// this is the screen that makes it true for everybody else.
const owner = await login(CAST.lumen.owner);
await settle(10);
owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.mail' });
await settle(16);
const screen = treeOf(owner);
ok('an owner has a screen for it', screen.includes('Replies go to'), 'under Settings, beside Automations');
ok('...showing what a member actually sees', screen.includes('Lumen Yoga') && screen.includes('lumen@'), 'composed from the same two parts the transport composes it from');

owner.dispatch({ type: 'ui:model', ref: 'replyTo', payload: 'studio@lumenyoga.at' });
await settle(6);
owner.dispatch({ type: 'ui:click', ref: 'save' });
await settle(16);
const saved = await runtime.db.query<{ reply_to: string }>("SELECT reply_to FROM studios WHERE id = 'st_lumen'");
ok('...and saving it reaches the row', saved.rows[0]?.reply_to === 'studio@lumenyoga.at', String(saved.rows[0]?.reply_to));
const other = await runtime.db.query<{ reply_to: string }>("SELECT reply_to FROM studios WHERE id = 'st_northrock'");
ok('...and only their own', other.rows[0]?.reply_to === 'hello@northrockbjj.at', 'the engine ANDs the caller’s studio onto the WHERE');

// ── THE CEILING, AND A DOMAIN OF THEIR OWN ───────────────────
owner.dispatch({ type: 'ui:model', ref: 'dailyCap', payload: 25 });
await settle(6);
owner.dispatch({ type: 'ui:click', ref: 'save' });
await settle(14);
const capped = await runtime.db.query<{ daily_mail_cap: number }>("SELECT daily_mail_cap FROM studios WHERE id = 'st_lumen'");
ok('a studio owns its own ceiling', Number(capped.rows[0]?.daily_mail_cap) === 25, `${String(capped.rows[0]?.daily_mail_cap)} a day — a column, because the right number is not ours to know`);
ok('...and it starts somewhere sane', (await runtime.db.query<{ daily_mail_cap: number }>("SELECT daily_mail_cap FROM studios WHERE id = 'st_northrock'")).rows[0]?.daily_mail_cap === 1000, 'generous for a day of honest work, cheap to raise');
ok('...and the screen offers a domain of their own', treeOf(owner).includes('Your own domain'), 'the upgrade for a studio that outgrows the shared sender');

report('consent is part of the question, the way out needs no session, and a studio owns the address a reply reaches');
