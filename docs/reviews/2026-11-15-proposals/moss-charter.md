# Fix proposals — moss and charter (against review-fix/all-check, 39c246ab)

Nothing here is built. Prototypes, probes and test files are in
`C:\Users\manxx\AppData\Local\Temp\claude\e4f12c79defa0edd\ac8bd814-1c73-419f-964e-fb981acb0ff8\scratchpad\proposals\moss-charter\`.

How "breaking" is measured: against `main`, the code apps run today. Where the branch already changed
an output compared with `main`, that is said, because merging the branch is what an app would see.

## What changed in this revision (after the independent check)

- **P-M1 is split.**
  - P-M1a (ready) removes only the four headers Node's fetch refuses, which turn every such webhook into a 502 today.
  - P-M1b (owner decision) covers stripping credentials and the sandbox on answers. DOCS line 2756 promises every header but `authorization` and `host` is forwarded. Browsers can also land on the hook from OAuth `form_post` and SAML POST; their landing pages need script and forms.
  - The sandbox now allows script and forms but never the app's origin.
  - The shared credential list is no longer widened: write listeners keep seeing `x-operator-key` as today. `x-operator-key` is stripped by the door alone.
- **P-M3 no longer refuses anything.** DOCS lines 2509–2511 promise that forwarding headers are not read, and that a proxy on the same machine counts as this machine. The ready fix answers as today and writes a warning to the dev log when a forwarding header names somebody elsewhere. Refusal is now an owner decision. The test that a forwarded `127.0.0.1` (or `Forwarded: for="127.0.0.1:5173"`, or `[::1]`) signs in with nothing logged is now in the prototype.
- **P-C1:** `mossDev` listens for browser connections only when the server it is given can report them. The original `vite-dev.test.ts` passes unchanged.
- **P-X1, charter part:** one rule with CHARTER-1. A prototype name in `extends`/`without` resolves as today, as an empty role, and is a `shape` warning shown through P-C1's channels. It is no longer a boot refusal, so P-X1 is ready.
- **P-C2:**
  - My position is now fail-closed: a string in `deny` or `without` is refused, as `main` mostly did under moss. The one-pattern reading is kept only for `allow` and `extends`. The choice between the two readings is the owner's.
  - `extends: 'ab'` is added to the confirm list.
  - `matchAll` reads a string as one pattern and leaves any other iterable as it was, so a `Set` of patterns still works.
- **P-C6:** the cycle part is dropped, because it changed the text of a boot refusal for a cosmetic gain. Only the optional `RoleClosure.functions` remains.
- **P-M11:** the new public field `cookieSession` is now an owner decision, not part of the ready proposal. The ready part is the internal identifiers and the prose.

How it was checked (this revision):
- Every item was re-run on fix-all-check: the third review's probes, `compare.ts` (charter on `main` against the branch), `aging.mts` (the sweep on PGlite), and test files of the proposed behaviour.
- `newtests\proposed.test.ts`: 24 moss tests. Today 16 fail; the other 8 pass because they pin today's behaviour that must not change. With the prototype, all 24 pass.
- The whole moss suite was run with the prototype files swapped in at load time (`moss.config.mjs`, `PROTO=1`): 1370 of 1370 pass.
- `charter-proto\test\proposed.test.ts`: 14 charter tests. On the branch 12 fail; the 11-star glob alone took 32.4 s. With the prototype, all 14 pass. They include a 20,000-case check that the new glob matcher answers exactly as the regular expression did.
- The existing charter suite passes on `charter-proto` except the two branch tests that read a string `deny` and a string `without` as one pattern (`engine.test.ts:183` and `:187`). P-C2's position reverses those two assertions. `tsc --strict` over `charter-proto` is clean.
- The browser half of P-M1b was reasoned from the HTML and cookie rules, not run in a browser: a sandboxed page without `allow-same-origin` has no origin, cannot read the app's cookies or storage, and sends no `SameSite=Lax` cookie on its own requests to the app.
- The moss prototype was type-checked file by file against a baseline. It adds no error except one implicit `any`, which comes from the harness not resolving `@niscorp/charter` types. A full `pnpm verify` was not run: the checkout is read-only.
- All 7 lab charters were read through the branch's shape check and the proposed rules. None has a misspelt key, a string where a list belongs, a role named only by an `Object.prototype` member, a deny beside an `actions` section, or a `scoping` that is not a string.

## Table

Counts: 27 items. None was already fixed. 20 proposals:
- **14 ready to build:** P-M1a, P-M3, P-M4, P-M6, P-M7, P-M8, P-M9, P-M10, P-X1, P-C1, P-C4, P-C5, P-C6, P-C7.
  - Two carry an "Owner to confirm" line: P-M7 and P-C7.
  - Two are docs only: P-M6 and P-M10.
  - P-M3 also names a follow-on owner decision: refusal.
- **6 need an owner decision:** P-M1b, P-M2, P-M5, P-M11 (the public field and the cookie; the renames are ready), P-C2, P-C3.

| # | Item | Proposal | Status |
|---|---|---|---|
| 1 | 3rd #1 (S1): the webhook door serves the vendor's HTML on the app's address and passes the browser's cookies on | P-M1b | needs owner decision |
| 2 | 2nd S1: the webhook copies every header but `authorization`/`host` (session cookie, `x-operator-key` reach the vendor) | P-M1b | needs owner decision |
| 3 | 2nd S2: `Transfer-Encoding: chunked`, `Keep-Alive`, `Expect` on a webhook → always 502 | P-M1a | proposal |
| 4 | 2nd S1 (dev): `/dev/as/<who>` trusts a loopback socket; a tunnel lets anyone sign in as anyone | P-M3 | proposal (a warning); refusal needs owner decision |
| 5 | **Not on the list — found while checking CHARTER-2:** the branch widens a role whose `scoping` is not a string: `main` gave it no rows, the branch gives it every row its grants allow | P-C4 | proposal (undoes a change on the branch) |
| 6 | CHARTER-1: a misspelt key (`denny`) is a boot warning only | P-C1 | proposal |
| 7 | charter: the shape check does not look at `scoping` being a non-string | P-C4 | proposal |
| 8 | 2nd charter S3 + coordinator item 1: `extends`/`without` naming `constructor`, `toString`, `hasOwnProperty` resolve as an empty role, no "Unknown role" | P-X1 | proposal (a warning, as CHARTER-1) |
| 9 | 3rd #2 (S3): an event for canvas `constructor`/`__proto__`/`toString` reaches every action on every canvas | P-X1 | proposal |
| 10 | 3rd #5 (S3): a principal called `toString`/`constructor`/`__proto__`/`valueOf` gets 500 on every request | P-X1 | proposal |
| 11 | 3rd #3 (S3): revoking a session takes far longer than `sessionRevalidateMs` with many sockets | P-M7 | proposal (Owner to confirm line) |
| 12 | 3rd #4 (S3): an endpoint's lower-case `authorization` is not replaced by the session's | P-M8 | proposal |
| 13 | 2nd S3: `Host: app.example.com:443` with `Origin: https://app.example.com` turns off cookie sign-in | P-M4 | proposal |
| 14 | 2nd S3 (suspected): after a downtime longer than `artifactsUnusedMs`, the first sweep deletes everyone's saved artifacts | P-M5 | needs owner decision (docs now) |
| 15 | 2nd charter S3: a 10-star glob against a 40-character id takes seconds | P-C5 | proposal |
| 16 | coordinator item 2 (C): a top-level `deny` beside an `actions:` section is dropped at resolution | P-C7 | proposal (Owner to confirm line) |
| 17 | 3rd #6 (S3): a lower-case `bearer` scheme is refused | P-M9 | proposal |
| 18 | 2nd S2: a webhook carrying `Authorization` never reaches the hook (401 from sign-in) | P-M2 | needs owner decision (docs now) |
| 19 | CHARTER-2: a string where a list belongs now reads as one pattern (narrows and widens compared with `main`); a non-string in `without` now refuses boot | P-C2 | needs owner decision |
| 20 | charter: exported `matchAll(patterns, ids)` reads a string pattern by pattern, one per character | P-C2 | needs owner decision |
| 21 | CHARTER-3: `*` matches line breaks: widens what an allow grants for ids containing one | P-C3 | needs owner decision |
| 22 | 2nd charter C: `RoleClosure` has no `functions`; a cycle is reported once per role per section | P-C6 | proposal (`functions` only; the cycle lines stay as they are) |
| 23 | 2nd C: nothing warns that a terminal can `publish` any channel with any payload into its own shell | P-M6 | proposal (docs only) |
| 24 | DOCS ~555–558, ~1333–1335: a read is saved without `body`, but the type requires `body` | P-M10 | proposal (docs only) |
| 25 | DOCS ~476: "A limit of 0 or less refuses the boot"; the code refuses anything under 7,200,000 ms | P-M10 | proposal (docs only) |
| 26 | 3rd #7 (C): DOCS 3,312 lines; promises restated in README/DESIGN/comments drift (a test title states what the code breaks) | P-M10 | proposal (docs only); a reorganisation is the owner's call |
| 27 | The word "held" in moss | P-M11 | needs owner decision for the public field and the cookie; the internal renames are ready |

The vex proposer's item, moss's `answerIntent` replaying through `engine.execute` without reach, is not covered here. Overlap: P-X1 edits `dispatch` in `packages/moss/src/shells/sessions.ts`. `answerIntent` is in the same file, at lines 100–103, so the two changes meet in one file but not in one function.

---

## Security first

### P-M1a — Headers Node's fetch refuses make every such webhook a 502 (ready)

**Problem.** The webhook route builds the vendor's request from every header that arrived (`integrations/forward.ts:107-110`). Node's fetch throws on `transfer-encoding`, `keep-alive`, `expect` and `upgrade` (checked with `hop.mjs`; `connection`, `te`, `trailer`, `proxy-connection` and `content-length` pass). So a vendor that sends its webhook chunked, or with `Expect: 100-continue`, gets 502 every time.

**Design.** The door drops those four headers before forwarding. Fetch frames the body itself from the bytes that arrived, and the bytes are unchanged.

**What changes for apps.** Nothing that works today: every request that carried one of these four was answered 502 and never reached the vendor. Those requests now reach it.

**Test.** `test/integrations-doors.test.ts`, proxy routes on a bare Hono with a stand-in fetch (no PGlite, no server). A hook sent with `keep-alive` and `expect` reaches the vendor without them, with `x-signature` and `content-type` intact. Fails today.

**Size.** src +4 / −0; test +8. **New mechanism:** no.

### P-M1b — The webhook door passes the browser's cookie on and serves the vendor's page on the app's address (needs owner decision)

**Problem.** Two parts of the door do this:
- The webhook forwards every header but `authorization` and `host`, and DOCS line 2756 promises exactly that.
- `relayed` (`forward.ts:77-78`) serves the vendor's answer with the vendor's content type, from the webhook and from the proxy.

Probe re-run on fix-all-check: `POST /integrations/acme/hook/x` with `Cookie: __Host-nisc.token=st_SECRET` was answered `200 text/html <script>alert(document.domain)</script>`, and the vendor received the cookie.

The hook asks for no session, so any web page can send a visitor there with a form that submits itself. The vendor's HTML then runs as the app's own page: it can read what the app keeps in the browser and open `/socket` with the visitor's cookie.

Browsers also land on the hook legitimately, so the door cannot simply stop serving pages:
- OAuth `form_post` callbacks (Apple, Microsoft) and SAML POST binding arrive as a browser POST;
- the landing page then continues with a script or a form.

**Position.** Stop the cookie leaving, and stop the vendor's page acting as the app, while keeping script and forms working:
1. **Out.** The webhook stops forwarding `cookie`, `proxy-authorization` and moss's `x-operator-key`, as it already stops `authorization`. Signature headers and everything else still go. The list in `data/writes.ts` for write listeners is not touched, so listeners keep seeing `x-operator-key` as today.
2. **Served.** `relayed` adds `x-content-type-options: nosniff` and `content-security-policy: sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation`. That is every allowance but `allow-same-origin`.
   - A landing page still runs its script, submits its form and moves the window on.
   - It does all that as a page with no origin. It cannot read the app's cookies, `localStorage` or `sessionStorage`. A socket it opens carries `Origin: null`, which `ownOriginOf` already refuses. Its own requests to the app go without the `SameSite=Lax` session cookie.
   - A `fetch()` that reads the answer ignores both headers, so the proxy's callers see no change.

**The trade, exactly.**
- **What stops working.**
  - A vendor that read the visitor's app cookie, or the operator key, at its hook. Nothing it could do with them is legitimate: only moss can check a session token.
  - A landing page served through the hook that reads or writes the app's own browser storage, such as a sign-in library keeping its PKCE verifier in the app origin's `sessionStorage`.
  - A landing page that posts a form back into the app and expects the visitor to arrive signed in. A form sent from a page with no origin carries no `SameSite=Lax` cookie; a link or a redirect that loads a page still does.
- **What keeps working.** Every server-to-server webhook (`lyra`'s `webhook-check.ts` and `billing-check.ts` send only signature headers and `content-type`), every `fetch` through the proxy, and a landing page that only runs script and navigates.
- **What stays open if the owner declines.** Any page on the web can make a signed-in visitor's browser send their session cookie to an approved vendor, and run that vendor's HTML as the app.

**Test.** `test/integrations-doors.test.ts`, bare Hono and a stand-in fetch:
- a hook sent with `cookie`, `x-operator-key` and `proxy-authorization` reaches the vendor without them;
- a `text/html` answer keeps its type and body and carries a `content-security-policy` that has `sandbox`, `allow-scripts` and `allow-forms` but not `allow-same-origin`, plus `nosniff`.

Both fail today. The browser half was reasoned, not run.

**Size.** src +11 / −5; test +20; DOCS 2756 rewritten. **New mechanism:** no.

### P-M3 — The dev sign-in through a tunnel

**Problem.** `/dev/as/<who>` answers any request whose socket is the loopback (`node/vite.ts:47-58`). A tunnel (ngrok, cloudflared, Tailscale Funnel, VS Code dev tunnels) runs on the developer's machine and connects from `127.0.0.1`. Anyone who has the tunnel's address can therefore sign in as anyone. Re-run: from `127.0.0.1` with `x-forwarded-for: 203.0.113.9` → `302` with a session cookie.

This is documented. DOCS lines 2509–2511 say forwarding headers are not read, and that behind a proxy on the same machine every request is this machine's. Remote dev environments that forward through such a proxy (Codespaces, dev tunnels) rely on that.

**Position (ready, non-breaking).** Nothing is refused. When the sign-in is answered for a request whose `x-forwarded-for`, `x-real-ip` or `Forwarded: for=` names an address other than this machine, the dev log gets a warning:

> `[moss] /dev/as/ada was answered for a request a proxy on this machine carried for 203.0.113.9. Through a tunnel, anybody who has its address signs in as anybody: close the tunnel, or keep it away from /dev/as.`

An IPv4 address with a port (`127.0.0.1:5173`) and a bracketed IPv6 address (`[::1]:5173`) are read as the address. DOCS adds that sentence about tunnels beside the existing promise.

**What changes for apps.** Nothing answers differently. A tunnel's sign-ins are now said in the dev log.

**Owner decision.** Refusing such a sign-in (403) would close the hole. It breaks the documented promise for remote dev environments until their host sets `signInFromNetwork: true`, and it would also refuse a local proxy that writes `unknown` or an obfuscated name (`for=_hidden`). That is the owner's call.

**Test.** `test/vite-dev.test.ts`, with its stand-in Vite and request objects (no server):
- from `127.0.0.1` with `x-forwarded-for: 203.0.113.9` → 302 and the warning names `203.0.113.9`. Fails today: nothing is logged;
- from `127.0.0.1` with `x-forwarded-for: 127.0.0.1`, `forwarded: for="127.0.0.1:5173"`, `forwarded: for="[::1]:5173"`, or no header → 302 and nothing logged.

**Size.** src +20; test +20; DOCS +2. **New mechanism:** no.

### P-X1 — Names that come from outside are looked up on plain objects (moss and charter)

**Problem.** A lookup like `record[name]` finds `Object.prototype`'s members too.
- **Moss: principals.** `assignedRoles` (`identity/resolution.ts:43`) does `assignments?.[principal]`. A principal called `toString` gets a function back, and every request fails with `500 identity_failed`. Re-run: `alice` 200; `toString`, `constructor`, `__proto__`, `valueOf` all 500.
- **Moss: canvases.** `dispatch` (`shells/sessions.ts:140`) does `getState().canvases[canvas]`. An event for canvas `constructor` gets no origin, and nova delivers it to every instance. Re-run: canvas `nope` re-renders nothing; `constructor` re-renders `main` and `side`.
- **Charter: roles.** `resolveRole` (`resolve.ts:46`) does `charter[role]`. `contractor: { extends: ['staff'], without: ['hasOwnProperty'] }` keeps every grant of `staff`, and the verifier says nothing. `without: ['nope']`, by contrast, refuses with `Unknown role "nope"`.

**Design.**
- **Moss.** A name from outside is looked up as the object's own key (`Object.hasOwn`): `assignedRoles` and `dispatch`. The other lookups by an outside name were checked and are safe: the reach paths start with `/integrations/`, and function names come from `Object.keys`.
- **Charter: one rule with CHARTER-1.** A role named in `extends` or `without` that the charter does not define, but that every object answers to, is the same mistake as a misspelt `denny`: what is written takes away, or adds, less than it says. It is treated the same way:
  - it resolves as today, as an empty role;
  - it is a `shape` warning, shown at boot, over the page in `nisc dev` and after `nisc build` by P-C1: `role "contractor": "without" names "hasOwnProperty", which the charter does not define: it takes nothing away`;
  - a name nobody answers to (`nope`) stays `Unknown role`, as today;
  - a role the charter does define under such a name (`{ constructor: [...] }`) is that role;
  - `resolveScoping` and the verifier's ancestor walk look up own keys, which gives the same results as today.

**What changes for apps.**
- Moss: nothing that works today. A principal called `toString` goes from 500 to their assigned roles, or `public`. An event for a canvas the shell does not have is dropped, as it already is for any other unknown name.
- Charter: nothing resolves differently. A charter with such a name gets a warning it did not get. No lab charter has one.

**Test.**
- Moss: `createIdentity({ assignments: { alice: ['staff'] }, readAs })` resolves `toString`, `constructor`, `__proto__` and `valueOf` to `['public']`.
- Moss: `sessionOn` over a stand-in shell with canvas `main` — an event for `constructor` is not dispatched; one for `main` is.
- Charter: `without: [name]` for `constructor`, `toString`, `hasOwnProperty` and `__proto__` resolves to all of staff's grants, with no error and the warning above. `extends: ['constructor']` adds nothing and warns. `without: ['nope']` still throws. A defined `constructor` role resolves.

No PGlite, no server. All fail today and pass on the prototypes.

**Size.** Moss src +3 / −2, test +15; charter src +12 / −3, test +20. **New mechanism:** no.

---

## Charter

### P-C1 — A misspelt key must be impossible to miss (CHARTER-1) — the owner's question

**Problem.** `{ staff: { allow: ['*'], denny: ['billing.*'] } }` boots and grants `billing.*`. The only signal today is one `[moss] charter: role "staff" has the key "denny", which the charter does not read…` line among the boot lines. Making it a refusal would stop charters that boot today.

**The answer.** The strongest non-breaking design puts the existing warning, unchanged in severity, in front of the author at the three moments every app already goes through. Nothing that runs today stops running.

1. **`nisc dev`, over the page.** On each browser connection, `mossDev` asks the booted server for `server.charterReport()`, which already exists and is public. If its `shape` warnings are not empty, `mossDev` sends them to Vite's error overlay: "The charter has what it does not read as written — the app runs, and what it lists does not apply:", one line per finding. The overlay comes back on every reload until the charter is fixed, and the app keeps running under it. Every app made by `npm create nisc` develops through `mossDev`. `mossDev` listens for connections only when the server it is given can report them (`ws.on` is a function). A stand-in Vite without it, such as the one in moss's own tests, runs as before.
2. **`nisc build`, at the end.** After the route table, the build prints the same lines under a `charter` heading, from the `charterReport()` of the server it already boots. The exit code does not change. An agent that builds the app reads them in the output it already reads.
3. **New apps fail their own check.** The `npm create nisc` templates that ship a charter (`classic/with/moss`, `model-first`) get one more line in `src/dev/artifacts-check.ts`: "the charter reads every key it is given", failing on any `shape` warning (through `verifyApp` from `@niscorp/moss`, which the templates already use). Policy lives in the app: an existing app gets the same by adding that line, and `nisc check` then fails on a misspelt deny.

The boot line itself stays as it is.

**Why not more.**
- Failing `nisc build`, or the check of an app that exists today, turns a green run red on upgrade. That is something a host must do before upgrading, so it is breaking.
- Refusing at boot is the breaking change the owner already declined.

If the owner later wants refusal to be the default, that is a separate, approved break. These three steps make sure nobody is surprised by it.

**What changes for apps.** Nothing in what they serve. In development, an app with a misspelt key sees an overlay it did not see before. That is the purpose.

**Test.**
- Moss, `test/vite-dev.test.ts`: a new case whose stand-in Vite has `ws.on`. An app whose `charterReport()` has a `shape` warning about `denny` → the overlay message names `denny`. Prototyped and passing; it fails today because nothing is sent. The file's existing 23 cases, whose stand-in has no `on`, pass unchanged on the prototype.
- The same warnings carry the new ones from P-X1 (prototype names) and P-C4 (`scoping`).
- CLI: `build` with a project whose `boot` returns a stand-in server → the printed lines include the warning, and `ok` is unchanged.
- The template change is covered by `pnpm check:create`.

**Size.**
- moss `node/vite.ts` +14;
- cli `commands.ts` about +6;
- each of 2 templates +3;
- tests about +25.

**New mechanism:** yes, one: moss writes to Vite's error overlay. No new public option.

### P-C4 — A `scoping` that is not a name (and a widening on the branch)

**Problem.** The shape check does not look at `scoping`. While checking this I found that the branch also widened what such a role reads:
- **`main`:** `resolveScoping` returned `def.scoping` as written. vex's `createScopePolicy` treats a value that names no profile as "no rows at all": `{ scoping: 5 }` or `{ scoping: null }` reaches no rows.
- **The branch:** `resolveScoping` returns `undefined` for anything that is not a string. `fieldsOf` also drops `null` fields. `undefined` means "no profile", so the role now gets every row its grants allow, without the profile's narrowing.

Re-run: `main` gives `5`, the branch gives `undefined` (`compare.ts`). That is a weakened protection, and a changed output compared with `main`.

**Design.**
- `resolveScoping` goes back to `main`'s reading: the value as written, via `roleOf` from P-X1. Behaviour is fail-closed again, as on `main`.
- The shape check gains a warning that reads the field off the role itself, so `null` is seen too: `role "r": "scoping" is 5, which is not a name: the role reaches no rows`.
- The warning travels through P-C1's channels.

**What changes for apps.** Nothing compared with `main`. Compared with the branch, a role with a non-string `scoping` reaches no rows again, as it does today.

**Test.**
- Charter: `resolveScoping({ r: { scoping: 5 } }, 'r')` returns `5`.
- `verifyCharter` warns with the sentence above.

Both fail on the branch.

**Size.** src +8 / −2, test +6. **New mechanism:** no.

### P-C2 — A value where the charter expects a list (CHARTER-2 and `matchAll`) (needs owner decision)

**Problem, compared with `main`** (all re-run in `compare.ts`). On `main` a string where a list belongs was read one pattern, or one role, per character.

| Written | `main` | branch |
|---|---|---|
| `allow: 'crm.*'` | every id: the `*` character alone matches everything | `crm.*` |
| `allow: 'crm.deal.view'` | only one-character ids | `crm.deal.view` |
| `extends: 'ab'` with roles `a` and `b` | extends `a` and `b` | `Unknown role "ab"`, refused |
| `deny: 'crm.*'`, under moss | boot refused: `dead-deny` on the characters | boots; denies `crm.*`; warning |
| `deny: '*'` (a string), under moss | boots; denies every id | boots; denies every id |
| `deny: 'crm.*'`, `resolvePrincipal` called directly | every id denied (the `*` character) | only `crm.*` denied: **wider** |
| `without: 'ab'` with roles `a` and `b` | subtracts `a` and `b` | `Unknown role "ab"`, refused |
| `without: [5]` with a role `"5"` | subtracts role `"5"` (JavaScript reads `5` as the key `"5"`) | boot refused (`shape` error) |
| `extends: [['v']]` | extends role `"v"` | extends nothing; warning |
| `matchAll('crm.*', ids)` (exported) | every id | every id: still one pattern per character |

**The owner's decision: how a string reads where `deny` or `without` expects a list.**
- **(a) One pattern** (the branch). `deny: 'crm.*'` denies `crm.*`, with a warning. A host that resolves without moss denies less than on `main`.
- **(b) Refused** (my position). It is a `shape` error, "what it takes away cannot be read". Under moss that refuses the boot, as `main` did for nearly every such charter through `dead-deny` on its characters. Outside moss, resolving the role throws instead of denying every id. That is fail-closed, and it never denies less than `main`. The charter already uses this rule for every other unreadable `deny` or `without`. (b) refuses two charters that boot on `main`:
  - `deny` written as the one-character string `'*'`;
  - a string whose every character matched a one-character id or role, such as `without: 'ab'` with roles `a` and `b`.

**Design (with (b)).**
- **Where a string grants**, in `allow` and `extends`, it is one pattern or one role, with a warning. This is the branch's reading.
- **Where it takes away**, in `deny` and `without`, it is refused.
- **Non-string entries in `extends` and `without`** go back to `main`'s reading: the role whose key that value is, as JavaScript reads a key (`String(entry)`), with a warning: `"without" lists 5, which is not a string: read as the role "5"`. This matches `main` on every JSON value. A non-list `deny` or `without`, or a non-string in `deny`, stays an error: on `main` those crashed.
- **`matchAll`** reads a string as one pattern and any other iterable of patterns as it did (`typeof patterns === 'string' ? [patterns] : patterns`). A `Set` of patterns keeps working. Number entries crash as on `main`.

**What changes for apps.**
- Owner to confirm, where a string grants:
  - `allow: 'crm.*'` stops granting every id;
  - `allow: 'crm.deal.view'` starts granting that id;
  - `extends: 'ab'` stops extending `a` and `b` and refuses, as an unknown role;
  - `matchAll('crm.*', ids)` stops matching every id.

  TypeScript refuses a string in all of these places, so only a charter typed loosely (JSON, a cast) can carry one. No lab charter does.
- Owner to confirm, where a string takes away (b): `deny: '*'` written as a string, and `without: 'ab'` with one-letter roles, booted on `main` and are refused.
- `without: [5]` and `extends: [['v']]` behave exactly as on `main` (not as on the branch), with a warning.
- Two branch tests change: `engine.test.ts:183` (a string `deny`) and `:187` (`without: "muzzle"`) now expect the refusal.

**Test.** Charter:
- `without: [5]` with role `"5"` → subtracted, no errors (fails on the branch);
- `deny: 'crm.*'` and `without: 'r'` → the two `shape` errors, and resolving throws (fails on the branch);
- `matchAll('crm.*' as never, ids)` → only `crm.*`, and `matchAll(new Set(['admin.*']), ids)` → `admin.panel` (the first fails today).

**Size.** src +16 / −5, test +14. **New mechanism:** no.

### P-C3 — `*` matches a line break (CHARTER-3)

**Problem.** The branch added the regex `s` flag, so `crm.*` matches `crm.a\nb`.
- For `deny` this closes a hole: on `main` a deny of `crm.*` did not cover such an id.
- For `allow` it grants one more id. nova accepts any string as an action id.

**Design.** Keep the branch's single rule: `*` matches any run of characters, line breaks included. Two glob rules, one for allow and one for deny, would be a special case and would break the README's "one glob rule".

**What changes for apps.** Owner to confirm: an id containing a line break is now matched by `*` in an allow as well as in a deny. No lab app has such an id: universes are action ids, `table.verb` and function names.

**Test.** Existing: `matchGlob('crm.*', 'crm.a\nb')` is true. **Size.** 0. **New mechanism:** no.

### P-C5 — A glob with many stars backtracks

**Problem.** `toRegExp` (`glob.ts:3`) compiles `a*b*c` to `^a.*b.*c$`. Against a long id that does not match, the regex tries every split. Re-run: `*a*a*a*a*a*a*a*a*a*a*b` against `'a'.repeat(40)` took 29.7 s in the test run.

**Design.** Match without a regular expression:
- the part before the first star is a prefix;
- the part after the last star is a suffix;
- each part between them is found left to right with `indexOf`.

The time grows with the pattern length times the id length, never exponentially. The answer is the same for every pattern and id: checked against the regex, with the `s` flag, on 20,000 generated pairs drawn from `a`, `b`, `.`, `*` and a line break.

**What changes for apps.** Nothing: same answers, faster.

**Test.**
- Charter: the 11-star pattern answers `false` in under 50 ms. Fails today.
- The 20,000-pair equivalence check.

**Size.** src +17 / −5, test +20. **New mechanism:** no.

### P-C6 — The report: `functions` in each role's closure (the cycle lines stay)

**Problem.**
- `RoleClosure` lists `actions`, `data` and `layouts`, but not `functions`, even when the functions universe is handed in.
- A cycle `a ↔ b` is said once per role and per section: four lines with two sections.

**Design.**
- `RoleClosure` gains an optional `functions?: string[]`, filled only when `universes.functions` is handed in.
- The cycle lines are left as they are. Saying a cycle once would change the text and the number of lines of a boot refusal, so a check that matches `actions: Role cycle` would stop matching. That cost is not worth a cosmetic gain.

**What changes for apps.** The field is optional, so code that builds or reads a `RoleClosure` still compiles. A `toEqual` over `perRole` in an app's own test sees the new field only when that test hands in functions.

**Test.** Charter:
- with a functions universe, `perRole[0].functions` is `['notes.add']` (fails today);
- a cycle is still reported as `actions: Role cycle through "a"`.

**Size.** src +2 / −1, test +6. **New mechanism:** no.

### P-C7 — A top-level `deny` beside an `actions:` section

**Problem.** `{ r: { actions: ['crm.*'], deny: ['crm.deal.delete'] } }` resolves to all of `crm.*`: `normalizeRole` reads only the section. The verifier refuses the pair (`ambiguous-selection`), so moss never boots it. A host that resolves without verifying grants more than was written.

**Design.** When both are written, the role's `actions` deny is the section's deny plus the top-level one. The top-level `allow` stays unread, since reading it would grant more. This is the charter's own asymmetry: what is written to take away is never dropped. The verifier's error is unchanged.

**What changes for apps.** Under moss, nothing: the charter is refused as before. Owner to confirm: a host that calls `resolvePrincipal` on such a charter without verifying it now denies what the top-level `deny` names. That is a narrowing to what was written.

**Test.** Charter: the example above resolves to `crm.contacts` and `crm.deal.view`. Fails today.

**Size.** src +5 / −3, test +3. **New mechanism:** no.

---

## Moss

### P-M7 — Revoking a session closes the socket within the clock

**Problem.** A revalidation pass asks about one connection, waits for the answer, then asks about the next (`socket/revalidation.ts:63-80`). A pass therefore takes as long as all the answers added together. DOCS line 842 promises a token is asked about again every `sessionRevalidateMs`. Re-run: 200 connections, a 20 ms verifier and `revalidateMs: 500` → the revoked token's socket closed after 6724 ms.

**Design.**
- A pass groups connections by token and asks the verifier once per token, every token at the same moment. It waits for the answers until the next pass is due: one timer for the pass instead of one per connection.
- An answer that comes after that is still acted on when it comes, as today.
- If the next pass came due while this one was still waiting, it starts as soon as this one ends rather than an interval later.
- A question that never answers keeps only its own connections unchecked, as today.

**What changes for apps.**
- Owner to confirm: the verifier is called at the same moments as before, and never more often in total: connections that share a token now share one call. The calls now come together at the start of each pass instead of one after another. An app whose verifier is a database query through a pool sees the pool queue them. One whose verifier calls a service with a strict concurrency limit would see a burst every interval. No new option is proposed. If the owner wants a cap on concurrent questions, it would be an additive option.
- The log line "could not be asked about N of M connection(s)" keeps counting connections.

**Test.**
- Moss, socket tests with fake timers and no server: 200 connections and a 20 ms verifier with `revalidateMs: 500`; one token is revoked and its connection closes within 1000 ms. Fails today: it is not closed after 2000 ms.
- The existing tests "a question the verifier never answers keeps only its own connection unchecked" and "a verifier that cannot be asked is said in the log, once for a pass" pass unchanged on the prototype.

**Size.** src +44 / −27, test +20. **New mechanism:** no.

### P-M8 — An endpoint's own `authorization` header, in any case

**Problem.** `createInternalWire` (`server/hosts.ts:159`) spreads `{ Authorization: 'Bearer <session>' }` over the endpoint's declared headers. A declared lower-case `authorization` survives beside it, so the request carries `Bearer tok-admin, Bearer tok-alice`. Re-run: a signed-in shell gets 401. The test title "an endpoint that declares its own `Authorization` is still made as the session" is true only for the capitalised spelling.

**Design.** Build a `Headers` from the declared ones and `set('authorization', 'Bearer <session>')` when there is a session. A header name is one name in any case.

**What changes for apps.** A signed-in shell whose endpoint declares lower-case `authorization` goes from 401 to working as the session, the same as the capitalised spelling today. A shell for nobody keeps sending what the endpoint declares, in either spelling, as today.

**What stays open (owner decision, not part of this fix).** On a shell for nobody, an endpoint's declared `Authorization` is used as is. If that header is bound to action data, the call runs as whoever that token is. Dropping it would change behaviour for an app that sends a fixed service token from a public screen, so it is not done here. Generated actions are not checked for headers either. Refusing those now would refuse an artifact that is accepted today.

**Test.** Moss, `test/server-wire.test.ts`, which already uses a bare Hono: the existing case for capitalised `Authorization`, plus lower-case `authorization` → the route sees `Bearer <session>` only. The lower-case case fails today.

**Size.** src +7 / −1, test +3. **New mechanism:** no.

### P-M4 — `Host` with the scheme's own port

**Problem.** `ownOriginOf` (`identity/session-cookie.ts:23`) compares `new URL(origin).host` with the raw `Host`. `https://app.example.com` has host `app.example.com`, so a `Host: app.example.com:443` from some proxies or clients is "not this origin", and cookie sign-in on the socket is off. Re-run: no match today.

**Design.** A `Host` that adds `:443` to an `https` origin, or `:80` to an `http` origin, names the same origin. Nothing else changes: other ports, other schemes and the `origins` list behave as today. No URL is built from the `Host`, so a `Host` carrying `@` or a path can never match a host it does not spell.

**What changes for apps.** A socket that was refused cookie sign-in for this reason now signs in. Anything accepted today is still accepted.

**Test.** Moss, `test/session-cookie.test.ts`, the `ownOriginOf` table:
- `https://app.example.com` + `app.example.com:443` → own;
- `http://` + `:80` → own;
- `http://` + `:443` → not own;
- `https://` + `:8443` → not own.

The first two fail today.

**Size.** src +4 / −1, test +4. **New mechanism:** no.

### P-M9 — `bearer` in any case

**Problem.** `routes.ts:56` reads the token only after `Bearer ` with that exact case. `Authorization: bearer tok` is handed to the verifier whole, as `bearer tok`, and refused with 401. RFC 9110 makes the scheme name case-insensitive.

**Design.** Read the token after `bearer` in any case, followed by one or more spaces. A header with no scheme is still read whole, as today.

**What changes for apps.** A request refused today is accepted. The only other difference: an app's own verifier that accepted the literal string `bearer <x>` as a token now receives `<x>`. `dev-open` and `sessions` cannot accept such a string.

**Test.** Moss: `authentication` on a bare Hono with a stand-in verifier. `Bearer tok`, `bearer tok` and `BEARER tok` all resolve to `alice`. Fails today for the last two.

**Size.** src +1 / −1, test +5. **New mechanism:** no.

### P-M2 — A webhook that carries its own `Authorization` (needs owner decision; docs now)

**Problem.** Sign-in runs on every path before any feature route (`server/routes.ts:23`), and a header that is not a valid session token is answered `401 invalid_token`. A vendor that signs its webhook with `Authorization: Basic …` never reaches the hook. Confirmed in `newtests`, which pins today's behaviour. Even if it did reach the hook, the door strips `authorization` on purpose, and P-M1b keeps that.

**Position.** Docs now. DOCS says it under the webhook door: "A webhook request must not carry `Authorization`: the app's sign-in answers it `401` before the door, and the door would not forward it. A vendor's signature travels in its own header."

Letting such webhooks through would take two changes:
- a core seam that lets a feature name paths sign-in skips;
- forwarding the sender's `Authorization`, which reverses a protection the door states.

Both are new mechanisms, and the owner should decide whether vendors that authenticate this way are in scope.

**What changes for apps.** Nothing.

**Test.** None: docs only.

**Size.** DOCS +3. **New mechanism:** no.

### P-M5 — Saved artifacts after a long downtime (needs owner decision; docs now)

**Problem.** The sweep deletes every artifact whose newest use is older than `artifactsUnusedMs` (`data/aging.ts:6-9`), and it runs as the server comes up. Time the app was down counts as unused. Re-run on PGlite (`aging.mts`):
- two artifacts were last used 26 and 27 hours ago, and `artifactsUnusedMs` is one day;
- the boot sweep deletes both, and their saves;
- what is published for everybody (`*`) stays.

**Position.** This is what DOCS promises ("once nobody has loaded it for this long"). It may also be a retention promise an app makes to its people, so changing it is not mine to decide.

Docs now: "Time the app is down counts as unused: after a downtime longer than `artifactsUnusedMs`, the sweep as the server comes up deletes everything of everybody's that was not used since."

If the owner wants downtime not to count, the closest non-breaking form is an option a host opts into. "Time before this process started does not count" needs no new table, but it means a process restarted more often than the limit never ages anything.

**What changes for apps.** Nothing.

**Test.** None now. The opt-in would be tested through `sweepUnused`'s statement, which needs a database, so that test belongs with the raw-SQL ledger's PGlite tests, not in a moss unit test.

**Size.** DOCS +3. **New mechanism:** no (yes if the opt-in is approved).

### P-M6 — A terminal's `publish` is the person's own words (docs only)

**Problem.** A terminal can send `{ type: 'publish', channel, payload }` with any channel and payload (`shells/sessions.ts:148`; the existing socket test "a publish carries its payload, whatever that is"). Inside the shell it cannot be told apart from `shells.deliver(principal, channel, payload)` from the server. DOCS says nothing about it.

**Design.** One paragraph under `deliver` (DOCS ~1708 and ~2055): "A channel is not a trusted lane. The person's own terminal can publish any channel with any payload into their own shell, exactly as `deliver` does. An action must not treat what arrives on a channel as coming from the server: it re-reads what it needs under its own policy, as a reaction already does." No code changes. Refusing terminal publishes would change the protocol.

**What changes for apps.** Nothing.

**Test.** None: docs only.

**Size.** DOCS +5. **New mechanism:** no.

### P-M10 — DOCS sentences that say what the code does not

**Problem and design.**
- **~555–558 and ~1333–1337.** A read is shown saved without `body`, but `SessionArtifacts.save` requires `body` in its type. Moss refuses a read that comes with a body (`artifactory/session.ts:134`), and `relay` already writes `body: undefined`. Show it that way and say why: "A read is saved with `body: undefined`: what vex wrote is kept as written." Making `body` optional in the type instead would break any app that implements `SessionArtifacts` itself, such as a stand-in in its tests.
- **~476.** Replace "A limit of `0` or less refuses the boot" with what `server.ts:89` checks: "A limit that is not a whole number of milliseconds, or is under two hours (7,200,000 ms), refuses the boot."
- **3rd #7.** The drift cases found are each fixed with their own proposal:
  - P-M8's test title becomes true for both spellings;
  - P-M1b changes DOCS 2756 if the owner chooses it;
  - P-M7 makes DOCS 842 true;
  - P-C2 and P-C4 change charter DOCS line 220's `shape` row.

  Reorganising DOCS (3,312 lines) and removing what README and DESIGN restate is a larger, separate decision for the owner. It is not proposed here.

**What changes for apps.** Nothing.

**Test.** None: docs only. `pnpm verify` covers links.

**Size.** DOCS about ±12. **New mechanism:** no.

### P-M11 — The word "held" in moss — the owner's question

**Where it is** (counted as the words `held`, `hold`, `holds`, `holding`, `holder` and `holders`, plus identifiers containing `Held`/`Hold`):

| Place | Count |
|---|---|
| `src/` | 343 lines in 58 files |
| `test/` | 334 lines in 48 files |
| DOCS.md | 145 lines |
| DESIGN.md | 50 lines |
| README.md | 5 lines |

No exported name in `api.txt` contains it. It appears in the public surface in exactly two places:
1. the field `WireTokenStore.held?: () => boolean` (`client/env.ts:9`, documented at DOCS ~2906 and ~2915). `lyceum/src/main.ts:30` reads it;
2. the cookie `<session>.held` (`identity/session-cookie.ts:32`, read by `client/env.ts:73`). `heldCookieName` is not exported.

The owner asked where the word is used. The table and the two public places above answer that. What follows is what renaming could look like; only the first part is ready.

**Ready, no break: internal renames and prose.**
- All internal identifiers can go, for example `heldTo`, `GeneratedHeldTo`, `ReadHeldTo`, `LayoutHeldTo`, `holdGranted`, `ShellFunctions.held`, `Revalidation.hold`, `requireHolder`, `holderOf`. None is in `api.txt`. Each commit only moves names, and `check:api` proves nothing public moved.
- All prose in DOCS, DESIGN, README and comments can be reworded.
- Size: about 680 renamed lines across `src` and `test` (moves only), and about 200 DOCS lines reworded. No new mechanism. Test: `check:api` and the existing suite.

**Owner decision 1: the public field `WireTokenStore.held`.**
- It can change only by addition: a new field beside it (for example `cookieSession?: () => boolean`), with both read. `held` would stay, marked `@deprecated`, for as long as any app implements or reads it; lyceum reads it.
- The cost: two names for one thing in the public type, possibly for good.
- Leaving it as it is costs nothing and breaks nothing.
- If chosen: +4 lines in src and one client test (a `WireEnv` with only the new field is treated as signed in).

**Owner decision 2: the cookie `<session>.held`.** A non-breaking path exists, but it is not free:
- the server writes both `<session>.held` and a new name on every sign-in and sign-out, and the client reads either;
- that has to last at least as long as the longest session cookie, which has no limit by default, plus as long as a page loaded before the upgrade stays open. In practice the old name is written forever, unless the owner later approves dropping it, which would be a break;
- the cost is one more `Set-Cookie` on every sign-in and sign-out, and one more cookie on every request.

My recommendation is to keep the cookie's name. The page never shows it, and no app reads it except through moss's own client.

**What changes for apps.** Nothing, for the ready part.
