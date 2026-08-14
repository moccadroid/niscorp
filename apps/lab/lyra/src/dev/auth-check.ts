// Run: pnpm --filter lyra exec tsx src/dev/auth-check.ts
//
// THE LINK IN SOMEBODY'S INBOX, and what it is worth to whoever else reads it.
//
// This check exists because of what step 5 changed. `auth.request` logged a URL
// carrying a SESSION token; the browser stored it verbatim (main.tsx), so the
// mail was the account: no expiry, unlimited uses, and worth everything to
// anyone who saw the URL. Nothing sent that mail, which is the only reason it
// was survivable. Sending it is what made it real.
//
// So the claims here are the ones an attacker would test: spend it twice, wait
// too long, guess, and ask for a thousand.
process.env['MAIL_SINK'] = 'log';

import { CAST } from '@lyra/db/seed';
import { principalByEmail } from '@lyra/server/links';
import { anonymous, ok, report, runtime, server, settle, treeOf } from './world';
import { linkLifetimeMs, mintLink, redeemLink, forgetLinkRequests } from '@lyra/server/links';

const LENA = CAST.lumen.member;
const now = Date.now();

const redeem = async (nonce: string): Promise<{ status: number; token: string }> => {
  const response = await server.request('/api/auth/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nonce }),
  });
  const body = (await response.json().catch(() => ({}))) as { token?: string };
  return { status: response.status, token: String(body.token ?? '') };
};

// ── asking for one ───────────────────────────────────────────
forgetLinkRequests();
const said: string[] = [];
const spoke = console.log;
console.log = (...parts: unknown[]) => void said.push(parts.map(String).join(' '));
// THROUGH THE SCREEN SOMEBODY ACTUALLY USES, on the anonymous shell — the only
// principal that can be here, and why `auth.login` is the charter's one public
// entry.
//
// ⟲ THE RENDER BELOW IS LOAD-BEARING, and it cost an hour. An action installs
// its model listeners during render reconciliation, so a `ui:model` dispatched
// before anything has rendered finds no listener and is DROPPED — silently.
// The handler then receives an empty address and refuses it, which looks
// exactly like a broken feature. A browser never meets this, because the shell
// has always rendered before anybody can type; a headless check meets it every
// time. Read the tree first, then type.
const stranger = await anonymous();
await settle(8);
treeOf(stranger);
stranger.dispatch({ type: 'ui:model', ref: 'email', payload: LENA });
await settle(6);
stranger.dispatch({ type: 'ui:click', ref: 'send' });
await settle(12);
console.log = spoke;

const minted = await runtime.db.query<{ n: number }>('SELECT count(*) n FROM login_links');
ok('asking for a sign-in link writes exactly one', Number(minted.rows[0]?.n ?? 0) === 1, `${String(minted.rows[0]?.n)} live link(s)`);
ok('...and the lab can still read it, sent or not', said.join('\n').includes('?login=') || said.join('\n').includes('[lyra:mail]'), 'the console link is what a developer signs in with');
ok('...and it is a nonce, never a session token', !said.join('\n').includes('?token='), 'the link buys a session; it is not one');

// ── spending one ─────────────────────────────────────────────
const person = await principalByEmail(server.executeAs, LENA);
ok('the address resolves to somebody', person !== undefined, LENA);

const nonce = await mintLink(server.executeAs, person ?? '', now);
const first = await redeem(nonce);
ok('a fresh link is traded for a session', first.status === 200 && first.token !== '', `${first.status}`);

const second = await redeem(nonce);
ok('...and spending it again is refused', second.status === 401, `${second.status} — DELETE ... RETURNING, so reading it and using it up are one statement`);

// ── the ones that should never work ──────────────────────────
const guessed = await redeem('nEt5C4rV6y2Vj1s0GZ5wUq8Xn3lPq7RbTf9hKm2A0dU');
ok('a guessed nonce is refused', guessed.status === 401, '256 bits, and nothing else to attack');

const stale = await mintLink(server.executeAs, person ?? '', now - linkLifetimeMs - 1_000);
const expired = await redeem(stale);
ok('an expired link is refused', expired.status === 401, `${Math.round(linkLifetimeMs / 60_000)} minutes, then it is scrap`);

// SPENT, EXPIRED AND NEVER-EXISTED ANSWER ALIKE. Three different sentences
// would make this a place to test nonces against.
ok(
  '...and all three refusals read the same',
  second.status === guessed.status && guessed.status === expired.status,
  'nothing here tells a stranger which of the three it was',
);

// ── asking a thousand times ──────────────────────────────────
//
// `auth.request` is public by charter, takes any address, and now SENDS. A
// limit is not politeness: without it this is a mail cannon pointed at
// strangers from our own sending domain.
forgetLinkRequests();
const { tooManyLinks } = await import('@lyra/server/links');
const attempts = [0, 1, 2, 3, 4].map((n) => tooManyLinks('stranger@example.com', now + n));
ok('a handful of requests is fine', attempts.slice(0, 3).every((limited) => !limited), 'three inside the window');
ok('...and then it says no', attempts.slice(3).every((limited) => limited), 'counted per address, because the address is what is being harmed');

// Counted BEFORE the directory is consulted, so a refusal costs the same for
// an address that exists and one that does not.
forgetLinkRequests();
const unknown = [0, 1, 2, 3].map((n) => tooManyLinks('nobody-at-all@example.com', now + n));
ok('...for an address nobody has, identically', unknown[3] === true, 'a limit that only applied to real accounts would be an oracle');

report('a sign-in link is a nonce: single-use, short-lived, rate-limited, and never a session');
