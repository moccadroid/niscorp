try {
  process.loadEnvFile();
} catch {
  /* no .env — the report below says what is missing */
}

import { stripeFor } from './integrations/stripe/client';
import { HANDLED_EVENTS, ensureDestination, listDestinations } from './integrations/stripe/setup';

const env = (name: string): string => process.env[name] ?? '';
const bold = (text: string): string => `[1m${text}[0m`;
const dim = (text: string): string => `[2m${text}[0m`;
const green = (text: string): string => `[32m${text}[0m`;
const amber = (text: string): string => `[33m${text}[0m`;

const stripe = stripeFor((name) => env(name));
if (stripe === undefined) {
  console.error('No STRIPE_SECRET. Put one in apps/lab/lyra-integrations/.env and run this again.');
  process.exit(1);
}

const url = process.argv[2];

console.log(`\n${bold('STRIPE SETUP')} ${dim('— everything a blank account needs, as a runnable artifact')}\n`);

const account = (await stripe.rawRequest('GET', '/v1/account', undefined, {})) as unknown as {
  id: string;
  country?: string;
  default_currency?: string;
  charges_enabled?: boolean;
};
console.log(`  ${'platform'.padEnd(22)} ${account.id}  ${dim(`${account.country ?? '??'} · ${String(account.default_currency ?? '').toUpperCase()}`)}`);

const connected = (await stripe.rawRequest('GET', '/v2/core/accounts?limit=20', undefined, { apiVersion: '2026-07-29.dahlia' })) as unknown as { data?: unknown[] };
console.log(`  ${'connected studios'.padEnd(22)} ${String(connected.data?.length ?? 0)}${(connected.data?.length ?? 0) === 20 ? '+' : ''}`);

const destinations = await listDestinations(stripe);
console.log(`  ${'event destinations'.padEnd(22)} ${String(destinations.length)}`);
for (const destination of destinations) {
  console.log(`    ${dim('·')} ${destination.id}  ${destination.status ?? ''}  ${dim(destination.webhook_endpoint?.url ?? '')}`);
}

if (url === undefined) {
  console.log(`\n${bold('To configure the webhook for a DEPLOYMENT:')}`);
  console.log(`  pnpm --filter lyra-integrations stripe:setup https://your-lyra/integrations/stripe/hook/events\n`);
  console.log(`${bold('For LOCAL development, use the CLI instead:')}`);
  console.log(`  stripe listen --forward-to localhost:5180/integrations/stripe/hook/events\n`);
  console.log(dim('  That prints a whsec_… of its own, per session. Put it in .env as'));
  console.log(dim('  STRIPE_WEBHOOK_SECRET and expect it to change — never bake one in.\n'));
  console.log(`${bold('Events this integration handles')} ${dim(`(${HANDLED_EVENTS.length})`)}`);
  for (const event of HANDLED_EVENTS) console.log(`  ${dim('·')} ${event}`);
  console.log('');
  process.exit(0);
}

if (!url.startsWith('https://')) {
  console.error(`\n  A webhook endpoint must be https. For local development use \`stripe listen\` — see above.\n`);
  process.exit(1);
}

const result = await ensureDestination(stripe, url);

if (!result.created) {
  console.log(`\n  ${amber('Already configured')} — ${result.destination.id}`);
  console.log(dim(`  Its signing secret was shown once, at creation, and cannot be read back.`));
  console.log(dim(`  If it is lost, delete this destination and run setup again.\n`));
  process.exit(0);
}

console.log(`\n  ${green('Created')} ${result.destination.id}`);
console.log(`  ${dim('receiving from')} @accounts ${dim('— the studios’ events, not the platform’s')}`);
console.log(`  ${dim('events')} ${String(HANDLED_EVENTS.length)}\n`);

if (result.secret === undefined) {
  console.log(`  ${amber('No signing secret came back.')} Delete this destination and run setup again.\n`);
  process.exit(1);
}
console.log(bold('  The signing secret, shown once and never again:\n'));
console.log(`    STRIPE_WEBHOOK_SECRET=${result.secret}\n`);
console.log(dim('  Put it in this deployment\'s environment now. There is no way to read it'));
console.log(dim('  back — a lost secret means replacing the destination, not recovering it.\n'));
