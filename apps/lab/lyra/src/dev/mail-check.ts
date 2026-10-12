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
  // Only this file is excused, not all of `src/dev`: a fixture naming the vendor is the likeliest leak.
  .filter((file) => file.path !== SELF);

ok('the app has source to check', files.length > 50, `${files.length} files`);

const VENDOR = /resend/i;
const namesVendor = files.filter((file) => VENDOR.test(file.text)).map((file) => file.path);
ok(
  'the mail provider is named in exactly one file',
  namesVendor.length === 1 && namesVendor[0] === 'src/server/mail/client.ts',
  namesVendor.join(', ') || 'nowhere',
);

// The lookahead lets an assignment through: setting `MAIL_*` is not reading it.
// Its `\s*` sits inside: outside, the greedy match backtracks to zero whitespace
// and the lookahead sees a space, not the `=`, which passes every assignment as a read.
const READS_ENV = /process\.env\[['"]MAIL_[A-Z_]+['"]\](?!\s*=[^=])/;
const readsEnv = files.filter((file) => READS_ENV.test(file.text)).map((file) => file.path);
ok(
  'the mail environment is read in exactly one file',
  readsEnv.length === 1 && readsEnv[0] === 'src/server/mail/send.ts',
  readsEnv.join(', ') || 'nowhere',
);

const IMPORTS_CLIENT = /from\s+['"](?:\.\/client|[^'"]*mail\/client)['"]/;
const importsClient = files.filter((file) => IMPORTS_CLIENT.test(file.text)).map((file) => file.path);
ok(
  'only the transport imports the client',
  importsClient.length === 1 && importsClient[0] === 'src/server/mail/send.ts',
  importsClient.join(', ') || 'nobody',
);

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

const mail = files.filter((file) => file.path.startsWith('src/server/mail/'));
const reaches = mail.filter((file) => /@niscorp\/(vex|moss)|PgPool|pool\.query|@lyra\/(app|server)/.test(file.text)).map((file) => file.path);
ok('the transport reads nothing and imports no engine', reaches.length === 0, reaches.join(', ') || 'two files, no database');

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
// The injected text survives as text. What must not survive is the newline that
// would begin a header, so the assertion is about lines, not about words.
const lines = second.split('\n');
ok('a newline in a display name cannot add a header', poisoned.ok && !lines.some((line) => line.startsWith('Bcc:')), lines[1] ?? '');
ok('...nor in a subject', !lines.some((line) => line.trimStart().startsWith('X-Injected')), lines[2] ?? '');
ok(
  '...and a caller cannot name the domain it appears to come from',
  second.includes('<lumenevilexamplecom@mail.lyra.app>'),
  'the box is sanitised and the domain is ours',
);

report('mail leaves by one door: one vendor, one secret, one verb, and no database behind it');
