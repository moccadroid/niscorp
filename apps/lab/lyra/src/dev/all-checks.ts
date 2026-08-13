// Run: pnpm --filter lyra check
import { spawnSync } from 'node:child_process';

const CHECKS = [
  ['seed-check', 'the dataset is what the suite assumes'],
  ['sql-check', 'SQL is written, not assembled: the schema is a constant, every value a parameter'],
  ['shell-check', 'charter, shells, chrome, and one surface per principal'],
  ['scope-check', 'the tenant boundary is engine-side, and a forged request cannot cross it'],
  ['sort-check', 'sorting is a context value, not a fingerprint — and the schema is the allowlist'],
  ['optional-check', 'an absent context key removes a condition rather than widening a reach'],
  ['members-check', 'the roll end to end: list, record, edit, save, and the list hears about it'],
  ['roles-check', 'each rung sees its own application, and the engine agrees with the screen'],
  ['reachable-check', 'every grant has a destination, and every destination has a grant'],
  ['theming-check', 'two studios, one deployment, different looks — and a swap reaches an open screen'],
  ['checkin-check', 'the desk loop: pick a class, tap somebody in, and both halves land together'],
  ['timetable-check', 'the grid drives the calendar, and commitments survive a schedule change'],
  ['acl-check', 'a role is a row: writing it re-resolves the charter and the open shell adopts'],
  ['identity-check', 'who somebody is, resolved once per session — held by the engine, bounded, and enumerable only by an operator'],
  ['identity-sql-check', 'the one read that cannot be authorised is pinned: five tables, no splicing, one row by key, and it runs against the schema'],
  ['held-state-check', 'what this app holds in memory, classified: a cache assigned from a query result is the defect, and the three legitimate kinds are named'],
  ['intake-check', 'signing somebody up, and the figures that follow'],
  ['plans-check', 'the price list, and why retiring beats deleting'],
  ['waitlist-check', 'full is a queue that moves itself; a one-off needs no rule'],
  ['course-check', 'a program is a stream; a course is a dated block'],
  ['tide-check', 'automations as principals: authored, scoped, idempotent'],
  ['automations-check', 'the automations, visible and still one studio’s own'],
  ['member-check', 'the member’s own side, and the boundary that allowed it'],
  ['model-check', 'one person, many relationships: concurrent entitlements, the drop-in, and manual money'],
  ['scoping-check', 'one table, two reaches: a rung says how far and the query cannot tell'],
  ['visibility-check', 'the owner can see who is coming, and a grant always has a destination'],
  ['multirole-check', 'a person is not one role: two roles add up, and the card is still theirs'],
  ['auth-check', 'a sign-in link is a nonce: single-use, short-lived, rate-limited, and never a session'],
  ['separation-check', 'the integrations service shares no code with this app'],
  ['consent-check', 'consent is part of the question, and the way out of it needs no session'],
  ['bounce-check', 'a bounce is signed, scoped and acted on — and a forged one is a 200 that changed nothing'],
  ['mail-check', 'mail leaves by one door: one vendor, one secret, one verb, and no database behind it'],
  ['perimeter-check', 'the integration authenticates its caller, not just the identity claimed'],
  ['admin-check', 'the administration tool administers Lyra and can reach nothing inside it'],
  ['integrations-check', 'an application arrives over a wire, for one tenant, and leaves again'],
  ['webhook-check', 'the one door that asks for nothing: forwarded, byte-faithful, and the pack still decides'],
  ['stripe-check', 'payments arrive as a pack: declared, placed, framed, and honest about having no key'],
  ['billing-check', 'Stripe speaks and a membership answers: signed, claimed once, stated rather than counted'],
  ['frame-check', 'a pack serves a page and the host frames it — declared, granted, and never identity'],
  ['roundtrip-check', 'the app survives being data: parsed from JSON it boots, renders and answers identically'],
  ['clock-check', 'one clock: the studio owns its day, and both halves compute it the same'],
  ['design-check', 'the surface holds: contrast in every theme, identity never wearing a status colour, prose never truncated'],
  ['language-check', 'one deployment, two languages, nothing shared but the rows'],
  ['phrase-harvest', 'every word this app can say, counted — and a seeded language missing one turns this red'],
  ['render-check', 'the kit draws it: every principal, every screen, every cell a spec names — through the real components, into a real DOM'],
  ['click-check', 'the other half of every click: what a control emits is what its trigger reads'],
] as const;

if (CHECKS.length < 25) {
  console.error(`\x1b[31mall-checks is missing its list — ${CHECKS.length} entries.\x1b[0m`);
  process.exit(1);
}

let failed = 0;
for (const [name, blurb] of CHECKS) {
  console.log(`\n\x1b[1m── ${name}\x1b[0m — ${blurb}`);
  const result = spawnSync('npx', ['tsx', `src/dev/${name}.ts`], { stdio: 'inherit', shell: true });
  if (result.status !== 0) failed += 1;
}

console.log(
  failed === 0
    ? `\n\x1b[32mAll ${CHECKS.length} checks pass.\x1b[0m`
    : `\n\x1b[31m${failed} of ${CHECKS.length} checks failed.\x1b[0m`,
);
process.exit(failed === 0 ? 0 : 1);
