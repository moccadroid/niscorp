# Charter proof — relay implementation plan

> Staging step 1 from [SERVER.md](../../../SERVER.md) §8: prove the charter
> client-side in relay. Sign-in (username → fake magic link → token), roles,
> catalog filtering at shell construction, read-RLS on, `locked: true`.
> No server, no socket. This is a proof of concept; the app server package
> is extracted from it later. Success = the demo script at the bottom
> passes. Verified against the code on 2026-07-15.

## SHIPPED — 2026-07-15 (commits a73eafe…9542098)

All phases landed; 20 dev checks green (`charter`, `rls`, `locked`,
`role-walk-check` are new); production build green. Deviations discovered
while building, now part of the record:

- **Suspended actions react to nothing** (current nova semantics) — a
  synthetic dispatch at a backgrounded list is ignored. `role-walk-check`
  automates the manual role walk of §12 headlessly, driving the real
  magic-link flow through the login action's own triggers.
- **Two vex fixes were required** (ceafce3), both invisible under
  `default: 'allow'`: subquery aliases are not entities (an alias was
  undeniable-to-list under deny), and RLS filters attach at the query level
  whose `from` lists the table — not merged into the top filter.
- **An unknown fingerprint under lock is 404 `cache_miss`**, not 400
  `locked` — a miss never generates either way; the check asserts the
  truth.
- **Mutation bodies carry the definition inline** (`{ mutation: <def>,
  context }`), exactly as the form seams send it.
- Usernames: `alex`=usr_001 (sales+dev), `jordan`=usr_002 (viewer),
  `sam`=usr_003 (admin). Jordan is the viewer; Sam is the admin.
- Ray's tools receive the token's userId mechanically at construction; the
  architect keeps its own generative engine path under the app's lock.

---

## 0. Current state (verified)

- **19 app actions + 2 devtools actions.** Ids today: `sidebar`, `topbar`,
  `home`, `settings`, `placeholder`, `assistant`, `confirm-delete`, `keys`,
  `contacts`, `contact`, `contact.form`, `companies`, `company`,
  `company.form`, `deals`, `deal`, `deal.form`, `tasks`, `task.form`,
  `devtools.dock`, `devtools.inspect`.
- **All actions registered unconditionally**: `src/nova/shell/actions.ts`
  builds `ACTIONS: Record<string, ActionDefinition>`; `src/nova/shell/shell.ts`
  passes it to `createShell({ actions: ACTIONS })` as a module-level
  singleton. Devtools register afterward via `shell.registerAction(...)` in
  `src/nova-devtools/core/install.ts`.
- **Identity is one constant**: `CURRENT_USER_ID = 'usr_001'` in
  `src/vex/runtime.ts`, injected as scope in `src/vex/http/fetch.ts:52`,
  folded as ambient `$.userId` in the shell transform (`shell.ts:85`), and
  passed into Ray's tools (`src/ray/tools.ts:130,186`,
  `src/ray/architect/tools.ts:158`).
- **The clock is frozen**: `CURRENT_DATE = '2026-06-13'` in
  `src/vex/runtime.ts` and `TODAY = new Date('2026-06-13T12:00:00Z')` in
  `src/vex/seed.ts`; all seed dates are offsets from it; `$.today` injects
  the constant. Decided 2026-07-15: this goes.
- **Scope policy is open reads**: `src/vex/scope.ts` — `default: 'allow'`,
  zero `read` rules, four write `set` stamps (owner_id / assignee_id). The
  DB has no real row-level protection today; vex's ScopePolicy is where RLS
  lives (PGlite, engine-level — not Postgres RLS).
- **Not locked**: no `locked` flag in relay's vex config. The fingerprint
  cache is seeded protected (28 entries in `src/api/index.ts` `ENTRIES`).
- **16 `.prism.ts` files** — audited 2026-07-15, every file read; findings
  and verdicts in §10.
- **No test runner.** Relay verifies with `tsx` check scripts in `src/dev/`.
  This plan follows that convention.
- **Nova facts this plan depends on**: `createShell` takes the full action
  map at construction; the map is add-only today (`removeAction` is added in
  phase 4); `shell.push` of an unknown id throws `UnknownActionError`;
  `auditAction(def, { catalog, channels })` and `collectChannels(def)`
  (`packages/nova/src/action/audit.ts`) are the closure machinery; layout
  `if:` branches on data paths.
- **Vex facts this plan depends on**: under `default: 'deny'`, a listed
  entity with `read: []` reads unfiltered, absent `read` throws
  `scope_denied` (`packages/vex/src/scope/apply.ts:42-54`); scope applies
  per-request to replayed fingerprints; `locked: true` makes unknown/changed
  fingerprints throw `VexError('locked')` → HTTP 400 and refuses
  fingerprint PATCH/DELETE.

## 1. Decisions (updated after review, 2026-07-15)

1. **Rename pass first.** Relay's ids violate the charter's leaves-only rule
   (`contact` exists alongside `contact.form`). A rename is a permissions
   change — done now, while there are no permissions yet.
2. **The frozen clock dies.** Seed dates become offsets from the real date
   at seed time; `$.today` is the real date, computed per request.
   Determinism survives because the whole dataset shifts with the clock —
   "overdue = today − 3" stays overdue.
3. **Auth is its own module** (`src/auth/`), clearly separated so it can be
   swapped later: username → fake magic link → token. Identity lives in the
   token, nowhere else. No global user constant; vex scope and `$.userId`
   read the token.
4. **`removeAction` lands in nova now** — a small fix: remove the definition
   and unmount its live instances (revocation semantics). Relay's shell
   still filters at construction; `removeAction` is the seam charter
   integration and the future server need.
5. **Devtools stay as they are** internally — no charter work inside them.
   They are granted only through a `dev` role; `installNovaDevtools` runs
   only for principals wearing it.
6. **Ray is out of scope.** No charter narrowing of Ray's catalog now; it
   returns when the app server is up. What does change: Ray's tools receive
   the token's `userId` mechanically at construction (higher-order
   injection — the model never sees or chooses an identity), same pattern
   vex uses.
7. **`locked: true` applies to the action-facing vex surface** (`vexFetch`).
   Prewarming is how classical API surfaces are built with vex; generation
   stays only on Ray's own tool path.
8. **Dangling triggers are shown, not patched.** A viewer's contact list
   still renders its row-menu Edit; the click pushes `crm.contact.form`,
   which is absent from the viewer's shell, and throws `UnknownActionError`.
   We don't hide the button — that would need per-role layout variants
   (ring 2, out of scope). The charter check's closure report lists every
   such dangling target per role, so the mismatch is documented, not
   silent.
9. **Prisms narrow to their real use cases** (§10): external-API response
   transforms and mutation/request payloads that derive from state. Static
   seams are deleted in favor of plain JSON bodies. Audit done 2026-07-15;
   the one structural change is `vexFetch` unwrapping vex's
   `{ result, meta }` envelope so `resultPrism` dies everywhere.

## 2. Phase 0 — the rename pass

New taxonomy (`area.entity.variant`, ids are leaves):

| old | new |
|---|---|
| `sidebar` | `chrome.sidebar` |
| `topbar` | `chrome.topbar` |
| `contacts` | `crm.contacts` |
| `contact` | `crm.contact.view` |
| `contact.form` | `crm.contact.form` |
| `companies` | `crm.companies` |
| `company` | `crm.company.view` |
| `company.form` | `crm.company.form` |
| `deals` | `crm.deals` |
| `deal` | `crm.deal.view` |
| `deal.form` | `crm.deal.form` |
| `tasks` | `tasks.manage` |
| `task.form` | `tasks.form` |
| `home`, `settings`, `placeholder`, `assistant`, `confirm-delete`, `keys` | unchanged (already leaves) |
| `devtools.dock`, `devtools.inspect` | unchanged (already compliant) |

Files touched: every `*.action.ts` above (the `id:` field plus every
`push`/`replace`/`resetTo` step targeting a renamed id);
`src/nova/shell/routes.ts` (`SCREEN_PATH` keys, `VIEW_PATH` key
`deals:board` → `crm.deals:board`, `SEGMENT[].screen` values — URL paths do
not change); `src/ray/catalog.ts` SEED ids; the dev checks that assert old
ids (`smoke.ts`, `harness-check.ts`, `board-new-deal-check.ts`,
`task-mgmt-check.ts`, `sidebar-counts-check.ts` at minimum). Message
channels (`screen-*`, `confirm-delete`, `devtools:entry`) are names, not
action ids — unchanged.

Gate: `typecheck`, `smoke`, `harness` green. No behavior change.

## 3. Phase 1 — unfreeze the clock

- `src/vex/seed.ts`: `TODAY = new Date()` (seed time). All existing
  `dateOffset`/`tsOffset` calls keep working — the data shifts with the
  clock.
- `src/vex/runtime.ts`: delete `CURRENT_DATE`.
- Shell transform and every `$.today` injection site: compute the current
  date per evaluation (`new Date().toISOString().slice(0, 10)`), never a
  module constant.
- Dev checks: grep for `2026-06-13` and any absolute-date assertion; convert
  to relative expectations (counts stay stable — overdue tasks are seeded at
  fixed negative offsets).
- Verify at implementation: PGlite is re-created and re-seeded per boot. If
  any persistence exists, the seed must refresh on boot or dates drift.

Gate: `smoke`, `task-mgmt-check`, `sidebar-counts-check` green on two
different (mocked) system dates.

## 4. Phase 2 — auth: username → fake magic link → token

New folder `src/auth/` — nothing outside it knows how sign-in works;
everything consumes `identity()`.

- **`src/auth/token.ts`** — `type Token = { sub: string; name: string; iat: number }`.
  `mintToken(username)` resolves the username against the known users and
  returns a base64url-JSON string. Explicitly fake — one function to
  replace with real signing later. `decodeToken(raw)` is the only reader.
- **`src/auth/session.ts`** — the token string in localStorage
  (`relay.token`); `identity(): { userId, name } | null` (decode),
  `signOut()`, `subscribe(fn)` (plain listener set).
- **`src/auth/fns.ts`** — two shell fns:
  `auth.sendLink` (username in → fake link payload out; the "email") and
  `auth.redeem` (mints + stores the token, notifies subscribers).
- **`src/nova/surfaces/auth/login.{action,layout}.ts`** — id `auth.login`.
  Flow on one canvas: username input (`ui:model`) → "Send magic link" →
  the layout reveals the fake link ("Magic link sent — open it") → click →
  `auth.redeem` → signed in. The link-in-the-UI is the stand-in for the
  email; the action's shape survives when real magic links arrive.

Usernames map to the seed's users (`alex` → `usr_001`, `sam` → `usr_002`,
`jordan` → `usr_003` — align with `src/vex/seed.ts` names).

Gate: `typecheck`; the action is authored but not yet reachable (wired in
phase 6).

## 5. Phase 3 — the charter module

New folder `src/charter/`, zero relay-specific imports (only
`@niscorp/nova` types) so it lifts out as the policy-engine package later.

**`types.ts`**

```ts
export type RoleDef =
  | string[]                                  // sugar for { allow }
  | { allow?: string[]; extends?: string[]; deny?: string[]; without?: string[] };
export type Charter = Record<string, RoleDef>;
```

**`glob.ts`** — one wildcard, matches across dots:
`'^' + pattern.split('*').map(escapeRegExp).join('.*') + '$'`.

**`resolve.ts`** — the algebra from CHARTER.md, verbatim:
`resolved(role) = (∪ resolved(extends) ∪ match(allow)) − match(deny) − ∪ resolved(without)`,
memoized, visit stack, cycle throws. `resolvePrincipal(charter, ids, roles)`
unions worn roles.

**`verify.ts`** — `verifyCharter(charter, ids, definitions)` returns
`{ errors, warnings, perRole }`: dead deny / bad reference / cycle /
leaves-only violation → **error**; dead allow / orphan action / re-allow of
an ancestor's deny / `without`-role-also-assigned → **warning**; per role a
closure report via nova's `auditAction` + `collectChannels` over the
granted definitions (dangling nav targets, dead emits).

**`charter.ts`** — the relay charter (Ray's roles return when Ray does):

```ts
export const CHARTER: Charter = {
  public: ['auth.login'],
  member: ['chrome.*', 'home', 'placeholder', 'confirm-delete'],
  viewer: { extends: ['member'], allow: ['crm.contacts', 'crm.companies', 'crm.deals', 'crm.*.view'] },
  sales:  { extends: ['viewer'], allow: ['crm.*', 'tasks.*', 'assistant', 'keys'] },
  admin:  { extends: ['sales'],  allow: ['settings'] },
  dev:    ['devtools.*'],
};
```

Expected resolutions (the check script's assertions):

| role | resolved set |
|---|---|
| `public` | `auth.login` (1) |
| `member` | `chrome.sidebar`, `chrome.topbar`, `home`, `placeholder`, `confirm-delete` (5) |
| `viewer` | member + `crm.contacts`, `crm.companies`, `crm.deals`, `crm.contact.view`, `crm.company.view`, `crm.deal.view` (11) |
| `sales` | viewer + 3 crm forms + `tasks.manage`, `tasks.form`, `assistant`, `keys` (18) |
| `admin` | sales + `settings` (19) |
| `dev` | `devtools.dock`, `devtools.inspect` (2) |

**`assignments.ts`** — stands in for the assignment table:

```ts
export const PRINCIPALS = [
  { id: 'usr_001', username: 'alex',   name: 'Alex Morgan',  roles: ['sales', 'dev'] },
  { id: 'usr_002', username: 'sam',    name: 'Sam Rivera',   roles: ['viewer'] },
  { id: 'usr_003', username: 'jordan', name: 'Jordan Blake', roles: ['admin'] },
] as const;
```

(usr_003 wearing `admin` but not `dev` proves the roles are orthogonal:
admin without devtools.)

**`src/dev/charter-check.ts`** + package.json script `"charter"`: resolves
every role against `Object.keys(ACTIONS)`, asserts the exact sets above,
asserts zero errors, asserts the known closure findings are present
(viewer's dangling `crm.*.form` targets), prints the per-role closure
report, exits nonzero otherwise. This is "if it boots, it's coherent" as a
check script — there is no devtools surface for it (decision 5).

Gate: `charter` green.

## 6. Phase 4 — `removeAction` in nova

`packages/nova/src/shell/shell.ts` + `types.ts`:

```ts
removeAction: (actionId: string) => void
```

Deletes the definition from the actions map and unmounts live instances of
it (revocation semantics — a removed action is gone, not zombie-running).
Unknown id is a no-op. Tests in `packages/nova/test/` cover: definition
gone (`push` now throws `UnknownActionError`), live instance unmounted,
fragments untouched.

Relay's shell filters at construction and does not call it in this proof;
it exists so charter integration (revocation, the server) has the verb.

Gate: nova's test suite green; no relay change.

## 7. Phase 5 — wire the shell to the catalog

**`src/nova/shell/shell.ts`** — singleton becomes a factory:

```ts
export const buildShell = (who: Identity | null): Shell => {
  const roles = who ? rolesOf(who.userId) : ['public'];
  const ids   = resolvePrincipal(CHARTER, Object.keys(ACTIONS), roles);
  const report = verifyCharter(CHARTER, Object.keys(ACTIONS), ACTIONS);
  if (report.errors.length > 0) throw new CharterError(report);
  const shell = createShell({ ..., actions: pick(ACTIONS, ids), functions: { ...existing, ...authFns } });
  if (ids.has('devtools.dock')) installNovaDevtools(shell);   // dev role only
  boot(shell, ids, who);
  return shell;
};
```

- **Boot pushes**: `chrome.sidebar` / `chrome.topbar` only if granted; main
  canvas gets the router target if granted, else `home` if granted, else
  `auth.login`. Anonymous boots to `auth.login` alone — the lock screen is
  the anonymous principal's one-action application, not a special case.
- **`src/vex/http/fetch.ts`**: `scope = { userId: identity()?.userId ?? 'anonymous' }`
  read per request from `src/auth/session.ts`. `CURRENT_USER_ID` is deleted;
  the seed keeps its own local notion of the demo users.
- **Shell transform**: ambient `$.userId` from `identity()`.
- **Sidebar** (`chrome.sidebar`): boot input
  `{ nav: {home, tasks, pipeline, contacts, companies, deals, settings}, user: {name} }` —
  booleans computed from the catalog (`tasks` ← `tasks.manage`,
  `pipeline`/`deals` ← `crm.deals`, ...). Each `NavItem` wraps in
  `{ if: '$.nav.<key>' }`. The hardcoded "Alex Morgan" footer binds
  `$.user.name` and gains a sign-out trigger → `{ fn: 'auth.signOut' }`.
  Same input-flag treatment for the topbar palette's screen list.
- **`src/app.tsx`**: identity state from `subscribe`; `buildShell` per
  identity; `<NovaShell key={who?.userId ?? 'anon'}>` remounts on change.
- **`src/ui/router.ts`**: a URL whose screen is not in the catalog redirects
  to `/`.
- **Ray**: `makeTools` receives `userId` from `identity()` at construction —
  mechanical injection, the model never chooses an identity. No other Ray
  change.

Gate: `smoke`, `harness` green (as alex/sales+dev); manual — anonymous lock
screen; sign in as each user; sidebar matches the role table; sam's
row-menu Edit throws `UnknownActionError`; jordan (admin, no dev) has no
devtools; sign-out returns to the lock screen.

## 8. Phase 6 — read RLS on (ring 3)

**`src/vex/scope.ts`** — complete new policy:

```ts
export const scopePolicy: ScopePolicy = {
  default: 'deny',
  entities: {
    // reference data — read-open, no writes exist
    users: { read: [] }, pipelines: { read: [] }, stages: { read: [] },
    products: { read: [] }, deal_products: { read: [] },
    lists: { read: [] }, list_members: { read: [] }, actions: { read: [] },
    // team-shared CRM records — read-open, creator-stamped writes
    companies:  { read: [], write: [{ set: 'owner_id', to: 'userId' }] },
    contacts:   { read: [], write: [{ set: 'owner_id', to: 'userId' }] },
    deals:      { read: [], write: [{ set: 'owner_id', to: 'userId' }] },
    activities: { read: [] },
    // personal — reads AND mutations pinned to the assignee
    tasks: {
      read:  [{ match: 'assignee_id', to: 'userId' }],
      write: [{ set: 'assignee_id', to: 'userId' },
              { match: 'assignee_id', to: 'userId' }],
    },
  },
};
```

Decided 2026-07-15: **tasks personal-only stands.** There is no
multi-tenant privacy at stake today — the rule exists to prove the ring-3
mechanism, not to protect data. The team-visible alternative (`read: []`
plus the existing `$context.userId` view filters) remains a one-line flip.

**`src/vex/seed.ts`** — spread task assignees deterministically
(~60% usr_001 / 25% usr_002 / 15% usr_003) so every principal's list is
non-empty.

**`src/dev/rls-check.ts`** + script `"rls"`: same tasks read as usr_001 vs
usr_002 → disjoint, both non-empty; insert as usr_002 → `assignee_id`
stamped regardless of payload; update of another's task → zero rows; read
of an unlisted entity → `scope_denied`.

Gate: `rls`, `mutation-check`, `smoke` green; sidebar task counts differ per
user in the app.

## 9. Phase 7 — locked

**`src/vex/http/fetch.ts`**: query handler config gains `locked: true`.
Novel/drifted shapes → 400 `{ error: 'locked' }`; fingerprint PATCH/DELETE
→ 403. The phase is a completeness proof: every read every action makes
must replay from the seeded fingerprints; gaps surface instantly in the
app. Ray's `query` tool and the architect keep their own generative engine
path — one comment at the `locked: true` site records the split.

**`src/dev/locked-check.ts`** + script `"locked"`: POST every `ENTRIES`
fingerprint → 200; one novel body → 400 `locked`; PATCH → 403.

Gate: `locked` green; full manual click-through of every screen and detail
as each user with zero `locked` errors.

## 10. Phase 8 — prism audit (audited 2026-07-15; this phase applies it)

The two legitimate uses of a seam prism: (1) external API responses whose
shape we don't control — none exist in relay today; (2) request/mutation
payloads that derive from action state. Everything static becomes plain
JSON. All 16 files were read; verdicts:

| file | verdict |
|---|---|
| `lib/format.prism.ts` | **keep — not a seam.** `money`/`dateText` fragments authored into the cache entries' mappings; vex-internal response shaping, where formatting belongs. |
| `nova/shared/result.prism.ts` | **delete — structural change.** `{ $ref: '$.result' }` exists only to lift vex's `{ result, meta }` envelope on every read. Instead, `vexFetch` unwraps `result` once at the adapter (the devtools trace keeps the full envelope, so `meta` stays visible); every endpoint `response: resultPrism` attachment is removed. |
| `chrome/sidebar.prism.ts` | keep — `$.userId` derives from state. |
| `chrome/topbar.prism.ts` | keep — search → `%q%` pattern with the empty-box sentinel. |
| `surfaces/home/home.prism.ts` | **delete.** All four exports are fully static (`context: { status: 'open' }`, `{}`). Plain JSON bodies inline in `home.action.ts`, still importing the api entries for their fingerprints. |
| `contact/contacts.prism.ts` | keep — search/sort refs; delete-mutation from `$.pendingDeleteId`. |
| `contact/contact.prism.ts` | keep — four reads keyed by `$.id`. |
| `contact/contact.form.prism.ts` | keep — the exemplar: name split, empty→null coercions, mutation payload. |
| `company/companies.prism.ts` | keep — same shape as contacts. |
| `company/company.prism.ts` | keep — three reads keyed by `$.id`. |
| `company/company.form.prism.ts` | keep — field refs + mutation payload. |
| `deal/deals.prism.ts` | **keep, minus three exports.** `listDealsPrism` (fingerprint `$case` switch, `'me'` → `$.userId`), `moveDealPrism`, `deleteDealPrism` stay; `boardStagesPrism` / `boardDealsPrism` / `boardSummaryPrism` are static (`context: {}`) → inline in `deals.action.ts`. |
| `deal/deal.prism.ts` | keep — five reads keyed by `$.id` / `$.record.*`; won/lost mutations. |
| `deal/deal.form.prism.ts` | **keep, minus three exports.** `upsertDealPrism` stays; `companyOptionsPrism` / `stageOptionsPrism` / `contactOptionsPrism` are static → inline in the actions (including `contact.form`'s reuse of the company options). |
| `task/tasks.prism.ts` | keep — the richest seam: scope-tab fingerprint switch, done-range bounds, `$.userId` / `$.today`, search. |
| `task/task.form.prism.ts` | keep — refs + empty→null coercions. |

Net: **2 files deleted, 6 static exports inlined out of 2 kept files, 13
seam files remain** — every survivor justifies itself by state derivation.
Use case 1 (external APIs) is currently empty in relay.

Gate: `typecheck`, `smoke`, `harness`, `locked` green.

## 11. Phase order and gates

| phase | lands | gate |
|---|---|---|
| 0 | rename pass | `typecheck`, `smoke`, `harness` |
| 1 | real clock | `smoke`, date-dependent checks on two mocked dates |
| 2 | `src/auth/` + `auth.login` action | `typecheck` |
| 3 | `src/charter/` + `charter` script | `charter` |
| 4 | nova `removeAction` | nova tests |
| 5 | `buildShell`, boot, nav flags, scope-from-token | `smoke`, `harness`, manual role walk |
| 6 | RLS policy + seed spread | `rls`, `mutation-check` |
| 7 | `locked: true` | `locked`, full manual click-through |
| 8 | prism audit | `typecheck`, `smoke`, `harness`, `locked` |

One commit per phase; relay runs after every phase.

## 12. The demo script (acceptance for the whole proof)

1. Fresh load, no token → lock screen: `auth.login` alone, no chrome.
2. Enter `sam` → "magic link sent" → open it → signed in as Sam (viewer).
   Sidebar: Home, Contacts, Companies, Deals/Pipeline. No My tasks, no
   Settings, no devtools.
3. Open a contact row menu → Edit → `UnknownActionError` in the console;
   nothing renders. Ring 1, enforced by absence.
4. Sign out → lock screen. Sign in as `alex` (sales + dev) → My tasks
   appears with *Alex's rows only* (ring 3); devtools toggle works; a
   created deal lands with `owner_id = usr_001` stamped server-side.
5. Sign in as `jordan` (admin) → Settings appears; devtools do NOT (admin
   without `dev` — roles are orthogonal).
6. Overdue counts are correct against the real current date.
7. POST a hand-crafted novel read to the vex endpoint → 400 `locked`.
8. `pnpm --filter relay charter && pnpm --filter relay rls && pnpm --filter relay locked` → green.

## 13. Out of scope, deliberately

- No server, no socket, no HTTP transport changes.
- No devtools changes beyond the conditional install — no principal tab;
  the closure report lives in the `charter` check output.
- No Ray charter integration — returns when the app server is up.
- No ring-2 shaping: no per-role variants, no hiding buttons whose targets
  are denied (the closure report names them instead).
- No charter editing UI, no assignment persistence — `charter.ts` and
  `assignments.ts` are checked-in constants standing in for library rows.
- No guard hook in nova (staging step 2); only `removeAction` lands.

## 14. What "pans out" means

The proof stands when the demo script passes and `src/charter/` +
`src/auth/` have zero relay-specific imports. Then extraction begins per
SERVER.md §8: `src/charter/` → the policy-engine package, `src/auth/` →
the session adapter contract, `buildShell`'s filter → served catalogs, and
the charter gets implemented in the app server itself.
