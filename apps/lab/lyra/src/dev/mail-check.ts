// Run: pnpm --filter lyra exec tsx src/dev/mail-check.ts
//
// THE FENCE ROUND THE MAIL TRANSPORT, and it is a check because it is no
// longer a process.
//
// Mail used to be planned as an integration, over a wire, in another service — and a
// integration cannot reach into this app because it cannot import it. Delivery is
// platform now (docs/plans/lyra-mail.md argues why: the send happens before a
// principal exists, so there is no tenant to resolve an install against), and
// the boundary that came free with a process boundary has to be asserted here
// instead. That is a weaker fence, and saying so is part of the deal.
//
// Four claims. Three are about where things are ALLOWED TO BE — the vendor's
// name, the deployment's secrets, the import — and the fourth is the rule that
// keeps this a file instead of a subsystem: the transport touches no database.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ok, report } from './assert';
import { sendMail } from '@lyra/server/mail/send';

const SELF = 'src/dev/mail-check.ts';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : [];
  });

const files = walk('src')
  .map((path) => ({ path: path.replace(/\\/g, '/'), text: readFileSync(path, 'utf8') }))
  // Every file BUT THIS ONE. A check that excused the whole of `src/dev` would
  // miss the likeliest leak of all: a fixture naming the vendor.
  .filter((file) => file.path !== SELF);

ok('the app has source to check', files.length > 50, `${files.length} files`);

// ── one: the vendor lives in one file ────────────────────────
//
// Swapping providers has to be REPLACING A FILE. The moment the name appears
// in a second place it is a refactor instead, and it will be discovered by
// somebody who is mid-migration rather than by this.
const VENDOR = /resend/i;
const namesVendor = files.filter((file) => VENDOR.test(file.text)).map((file) => file.path);
ok(
  'the mail provider is named in exactly one file',
  namesVendor.length === 1 && namesVendor[0] === 'src/server/mail/client.ts',
  namesVendor.join(', ') || 'nowhere',
);

// ── two: the secrets are read in one file ────────────────────
//
// An integration declares its environment and the accessor throws on anything
// undeclared (pack.ts). In-house there is no accessor, so the equivalent claim
// is this one: `MAIL_*` is read where mail policy lives and nowhere else.
// READING is what this forbids, and SETTING is not reading. A file that reads
// `MAIL_*` holds an opinion about whether we are configured to send, and there
// may be one of those; a check that sets `MAIL_SINK` is choosing which
// deployment it is standing in, which is what a lab does — the same way
// billing-check hands itself a `STRIPE_KEY`. The lookahead is that distinction.
// The `\s*` sits INSIDE the lookahead deliberately: outside it, the greedy
// match backtracks to zero whitespace and the lookahead then looks at a space
// rather than at the `=`, which passes every assignment as a read.
const READS_ENV = /process\.env\[['"]MAIL_[A-Z_]+['"]\](?!\s*=[^=])/;
const readsEnv = files.filter((file) => READS_ENV.test(file.text)).map((file) => file.path);
ok(
  'the mail environment is read in exactly one file',
  readsEnv.length === 1 && readsEnv[0] === 'src/server/mail/send.ts',
  readsEnv.join(', ') || 'nowhere',
);

// ── three: nothing reaches past the verb ─────────────────────
//
// `sendMail` is the whole surface. An importer of `client` has gone round the
// composition — the sanitising, the sender identity, the missing-key posture —
// to talk to a vendor directly.
const IMPORTS_CLIENT = /from\s+['"](?:\.\/client|[^'"]*mail\/client)['"]/;
const importsClient = files.filter((file) => IMPORTS_CLIENT.test(file.text)).map((file) => file.path);
ok(
  'only the transport imports the client',
  importsClient.length === 1 && importsClient[0] === 'src/server/mail/send.ts',
  importsClient.join(', ') || 'nobody',
);

// ── four: two callers, and they are named here ───────────────
//
// THE FENCE THE DESIGN ACTUALLY RESTS ON, and the one that was documented and
// unasserted. Mail spreads by acquiring call sites: a screen that sends one
// directly, a function that "just needs to notify somebody", and then the rule
// that the transport reads nothing is the only thing left holding it together.
// Two callers is not a coincidence to be observed — it is a claim, and a third
// one should have to come and edit this line.
// WHAT SHIPS, not what tests. A check exercising the transport is a check
// doing its job — `consent-check` sends two messages at the sink to prove a
// footer rides one and not the other. The fence is about the PRODUCT acquiring
// the ability to send: a screen, a handler, a helper that "just needs to
// notify somebody".
const CALLERS = ['src/server/tide.ts', 'src/server/functions/auth.ts'];
const callers = files
  .filter((file) => !file.path.startsWith('src/dev/') && !file.path.startsWith('src/server/mail/'))
  .filter((file) => /\bsendMail\b/.test(file.text))
  .map((file) => file.path);
ok(
  'the transport has the callers it is supposed to have',
  callers.every((path) => CALLERS.includes(path)),
  callers.join(', ') || 'nobody yet',
);

// ── five: the transport touches no database ──────────────────
//
// THE RULE THE WHOLE DESIGN RESTS ON. Recipients are resolved by a vex
// selection under the studio's own automation principal, which is where the
// tenant boundary already is. A transport that could read rows would resolve
// them itself, and then it would need a tenancy of its own.
const mail = files.filter((file) => file.path.startsWith('src/server/mail/'));
const reaches = mail.filter((file) => /@niscorp\/(vex|moss)|PgPool|pool\.query|@lyra\/(app|server)/.test(file.text)).map((file) => file.path);
ok('the transport reads nothing and imports no engine', reaches.length === 0, reaches.join(', ') || 'two files, no database');

// ── and it answers rather than throwing ──────────────────────
//
// Every one of these is a value a caller has somewhere honest to put: a column
// on the outbox row, or a line beside the sign-in link that did not go.
delete process.env['MAIL_SINK'];
delete process.env['MAIL_PROVIDER_KEY'];
delete process.env['MAIL_FROM_DOMAIN'];

const message = { to: 'lena@example.at', fromName: 'Lumen Yoga', fromBox: 'lumen', replyTo: 'hallo@lumenyoga.at', subject: 'Welcome', text: 'See you Tuesday.', key: 'msg_1' };

const unconfigured = await sendMail(message);
ok(
  'with no provider key it records a reason rather than crashing',
  !unconfigured.ok && unconfigured.reason === 'no provider configured',
  JSON.stringify(unconfigured),
);

const nobody = await sendMail({ ...message, to: 'not-an-address' });
ok('a message to nobody is refused before any provider hears about it', !nobody.ok, JSON.stringify(nobody));

// ── what the wire would carry ────────────────────────────────
//
// The sink is the only way to observe a composed envelope without a provider,
// which is exactly what makes it worth having: the composition is where header
// injection and sender spoofing would land, and neither is visible from the
// outside otherwise.
process.env['MAIL_SINK'] = 'log';
process.env['MAIL_FROM_DOMAIN'] = 'mail.lyra.app';

const said: string[] = [];
const spoke = console.log;
console.log = (...parts: unknown[]) => void said.push(parts.map(String).join(' '));
const sunk = await sendMail(message);
const poisoned = await sendMail({
  ...message,
  fromName: 'Lumen\r\nBcc: everyone@example.com',
  fromBox: 'lumen@evil.example.com',
  subject: 'Welcome\nX-Injected: yes',
  replyTo: 'not an address',
});
console.log = spoke;

ok('the lab sink sends nothing and says so in the id', sunk.ok && sunk.id.startsWith('sink_'), JSON.stringify(sunk));
ok('...and the envelope wears the deployment domain', said.join('\n').includes('<lumen@mail.lyra.app>'), said[0]?.split('\n')[1] ?? '');

const second = said[1] ?? '';
// WHAT IS BEING CLAIMED, precisely: the injected text SURVIVES — as text. It
// is a display name reading "Lumen Bcc: everyone@example.com" and a subject
// reading "Welcome X-Injected: yes", which is ugly and harmless. What must not
// survive is the NEWLINE, because that is the character that ends a header and
// begins one the caller wrote. So the assertion is about lines, not about
// words: everything the caller sent occupies exactly the line it was put on.
const lines = second.split('\n');
ok('a newline in a display name cannot add a header', poisoned.ok && !lines.some((line) => line.startsWith('Bcc:')), lines[1] ?? '');
ok('...nor in a subject', !lines.some((line) => line.trimStart().startsWith('X-Injected')), lines[2] ?? '');
ok(
  '...and a caller cannot name the domain it appears to come from',
  second.includes('<lumenevilexamplecom@mail.lyra.app>'),
  'the box is sanitised and the domain is ours',
);

report('mail leaves by one door: one vendor, one secret, one verb, and no database behind it');
