# Server-drawn pages, and pages

**Status: built (2026-10-02).** Built and checked: the document (`renderDocument`), pages (`app.pages`), the
needs-a-shell verdict, pages as files (`exportDocuments`), server-side
React, Vue and DOM targets, and the `nisc` command (`@niscorp/cli`: `dev`,
`build`, `export`, `start`, `check`) — in moss and nova, with atrium and lyra
wired.
**Added 2026-10-03:** an app with its OWN shell — no moss — drawn ahead of time
and adopted by its page (§8). Mythos is wired.
**Not built:** opening the app at a position (deep links), a stricter cookie,
offline, the other apps.

This is the record of a design conversation and what came out of it: what was
decided and by whom, what was measured, what turned out to be wrong on the way,
and what is still open. What the code *is* lives in
[`packages/moss/DESIGN.md`](../../packages/moss/DESIGN.md) ("The document",
"Pages") and [`DOCS.md`](../../packages/moss/DOCS.md#the-document).

---

## 1. What was asked

> Can we do SSR for pages that don't need server shells? And rehydration? …
> how would we render everything out statically so we could host it on a CDN?
> Statically, mechanically checked on build so we *know* whether this needs any
> shell.

Later: a full moss server with SSR for every page; static builds the way Next
and Nuxt do them, where a path that needs nothing is served as a file; the
option to build the whole thing statically and know what degrades; offline.

## 2. The model that came out

Two things a path can lead to, and four rules.

| | The app (`shell`) | A page (`pages`) |
|---|---|---|
| What it is | one durable shell per person; it rearranges itself around them | a manifest at a path, drawn for whoever asks |
| Kept | yes — until sign-out, reset or the idle sweep | never: one read, or one connection |
| `onSession` | runs | does not |
| Signed-in person | their app | the page, plus whatever the charter grants them on it |

1. **Who you are is the same everywhere.** A page is drawn for whoever asks.
   What it has for them is ring 1: a strip naming the signed-in person is an
   action a member is granted. (An earlier draft had a page run "as public",
   unable to know who was looking. That was a limitation dressed as a
   principle — see §5.)
2. **A shell exists only while something needs one.** Whether a drawn screen is
   finished is decidable from the actions mounted on it. The app is always
   live for a signed-in person, because it is the thing that is kept.
3. **Who may keep a page follows from who asked.** Drawn for nobody: the same
   for everybody, cacheable, writable to a file. Drawn for somebody: theirs.
   One function decides (`documentHeaders`); nothing declares it.
4. **A drawn page is a first frame delivered early.** The socket is unchanged
   and still the authority.

A path does **not** address a position inside the app. The app's shell is one
per person across every tab; a URL cannot hold something two tabs would
disagree about. A path can point at a pre-configuration (unbuilt, §6).

## 3. Decisions, and whose they were

| Decision | Tier | Answer |
|---|---|---|
| Draw pages on the server | answered | "If we can get SSR for all pages, that's even better." |
| A cookie to know who is asking | answered | "If that means we need a cookie… sure." The simple flavour: a copy of the token, written by the wire. |
| Presses before the socket opens | answered | "I agree with dropping everything whilst not online." Dropped, never queued. |
| Cached/static pages are only ever the anonymous render | answered | "The static/cached page can't be under anything but the anonymous principal." |
| One shell per person; pages need none | answered | "I don't think we need to show multiple shells of the same logged in user… that's the app… they can open anonymous pages easily because they don't need a shell." |
| A signed-in person is themselves on a page | answered | "Why can't I be signed in as max? It just doesn't create a shell for me." |
| `functions` and `onSession` stay with the app | answered | "I agree… functions and onSessions." |
| Wait at most 300 ms for a screen to settle | **delegated by default** | Picked from the slow-database run (§4). Not asked. |
| Atrium gets an `/about` page | answered | Built as the worked example, unasked; kept ("yes to all"). `apps/lab/atrium/PLAN.md` D5b. |
| Lyra is wired | answered | Built as the second app, unasked; kept. `apps/lab/lyra/PLAN.md` D5a. |
| The command lives in `@niscorp/cli` | answered | "nisc/cli is fine." `@niscorp/nisc` pins it with the rest of the set. |
| Atrium and lyra run through `nisc` | answered | `dev`, `build`, `start`, `check`. The other moss apps follow one at a time; fable and mythos have no moss to boot. |

## 4. What was measured

All on atrium's real server and kit unless said, one core, PGlite.

| Question | Result |
|---|---|
| Draw a signed-in screen to a string (warm) | 0.4–0.7 ms |
| A whole anonymous document: build, read, draw | ~0.65 ms; about 1,500 a second |
| Page weight added (markup + snapshot, gzipped) | 3–5 KB |
| Does React adopt the server's elements | Yes, zero complaints — jsdom, and headless Chrome against a built bundle with a real socket (`browser-probe`) |
| Is the socket's first frame the page's own | Yes: a principal's durable shell, byte for byte; an anonymous one through the seed |
| Same person built twice, ids renumbered | Identical trees |
| Settle signal under a database slowed to 40 ms a query | Quiet after 165–275 ms (6–16 queries a shell); the tree never changed afterwards |
| The palette before any script | Absent unless the server writes it; present when it does (Chrome) |
| Every React kit in the repo | atrium, relay, encore, lyra-admin, lyceum: render and adopt cleanly. Lyra: failed on a wide window until fixed (§5) |
| Lyceum's three kits | DOM on a server DOM, React, Vue: all draw; React and Vue adopt with no warnings |
| How much of an app is static | atrium: 0 of 63 actions (even the lock screen calls a function). lyceum: 27 of 62, 23 of them slides |

The last row is why static export is for content — a site, a talk — and not for
application screens.

## 5. What was wrong on the way

Kept because each one is a trap somebody will walk into again.

- **"A public page cannot know who you are."** Proposed as a hard rule to keep
  cached pages safe. The thing actually worth protecting was narrower — a kept
  page must not hold personal data — and that is protected by keying on who
  asked. The rule would have forbidden a signed-in strip on the docs for no
  case it prevented.
- **Counter instance ids.** The first plan for matching an anonymous page to its
  socket was a per-shell counter. The origin an event claims is checked against
  the canvas it names, and that check only means something while a stale id
  names nothing in another shell. Hence a random seed per document.
- **`socket.send` while connecting.** With nothing on screen before the first
  frame, nothing could be pressed before the socket opened. A drawn page changes
  that, and a browser WebSocket throws on `send` while connecting. `dispatch`
  and `publish` now check for `open`, as `back` and `popTo` always did. One
  existing test sent on an unopened socket; it now opens it first, and a new
  test holds the drop.
- **`String.replace` with a string.** The document was assembled with
  `template.replace(root, html)`; a screen containing `$&` was read as a
  pattern. Found by a test written for it. Both replacements take functions now.
- **The snapshot is an injection point.** React escapes the markup; the JSON
  beside it carries what people typed, inside a `<script>`. Every `<` and
  U+2028/2029 is escaped.
- **`typeof window` in a state initialiser.** Lyra's `useWide` answered `false`
  on the server and `true` in a wide browser for the same first render; React
  discarded the page. The guard was written by somebody thinking about servers,
  and it is the bug. Fixed with `useSyncExternalStore` and a server snapshot;
  the portal waits for the first pass.
- **Numbers from stale builds.** The packages' `dist` was three to four days
  older than the source for the first rounds of probing. Everything was re-run
  after a rebuild; the results held, but the first render timing (26 ms) had
  also been a cold call, not a real figure.
- **"There is no settle signal."** There was: nova marks an instance `active`
  only after its mount hook has been awaited. What was missing was moss awaiting
  it — `seeds` were fired and forgotten.

## 6. What is not built, and why

- **Opening the app at a position.** A deep link into the app's shell. Not the
  same as a page's parameters: the shell is durable and shared, so an opener
  must be idempotent against what is mounted and must say what a reload means
  after the person has moved on. The likely shape is "an instruction, carried
  out once, then taken out of the address bar".
- **A stricter cookie.** `HttpOnly`, read by the socket at the upgrade, the
  token out of script and out of the URL. Needs login to finish over HTTP and
  an Origin check on the upgrade; sibling subdomains count as the same site, so
  that check is not optional.
- **Letting a page's connection go** once its frames are sent, when the page is
  not live for the person who connected.
- **Listing a parameterised page's paths.** `nisc export` writes `/` and every
  page whose path has no parameter. A page like `/docs/:slug` has as many paths
  as there are rows, and the app lists them in `nisc.config.ts` (`paths`); no
  app does yet, so that seam has only unit tests behind it.
- **`nisc dev` owns nothing.** It runs the app's own vite config, and each app
  still carries its own ~120-line app-server plugin. One shared plugin would
  remove that; it was left alone because each plugin also holds app-specific
  routes (the dev sign-in).
- **Offline.** PGlite and the shell in the browser is the client-degrade
  posture, which exists (mythos, fable). Persistence, a service worker and sync
  do not. Separate work, outside moss.
- **Islands.** One screen with some canvases served and others local — moss's
  design doc calls them authority islands. The piece that would make it
  possible, reading a local shell as a `RenderApi`, now exists (nova's
  `shellView`, §8); composing the two on one screen is not built.
- **A moss app whose public pages run their own shell.** `nisc.config.ts` is one
  kind or the other. An app that is behind moss for its members and wants its
  public paths taken over by a shell in the page — not just drawn — is the
  mixed case, and it is not built or tested.
- **Carrying the build's answers.** A drawn screen holds what its reads
  answered at build; the page's boot asks again. Where the two differ the page
  draws that part again (React says so in the console). Mythos formats due
  dates against today, so its file is exact on the day it was built. Handing
  the page the build's answers so adoption is always exact is not built.
- **The other apps.** Relay, encore, lyra-admin and lyceum are not wired.
  Lyceum's default renderer is its DOM kit, so its server would draw with
  `terminal/dom/server` and a DOM library, or with its React kit.
- **Scale-out.** The page request and the socket should land on one process.

## 6a. Proof

`docs/plans/server-drawn-pages-proof/` holds five photographs taken by Chrome of
pages served by `nisc start`, each with **its script tag removed** — what is on
screen is markup and the stylesheet, nothing else:

| File | Request | What it shows |
|---|---|---|
| `app-nobody.png` | `/`, no cookie | the lock screen |
| `app-guest.png` | `/`, a guest's cookie | her stay |
| `app-staff.png` | `/`, a clerk's cookie | the front desk, with its rows |
| `about-nobody.png` | `/about`, no cookie | the page |
| `about-guest.png` | `/about`, a guest's cookie | the page, with "Signed in as Amara Osei" |

The photographed copies differ from the served bytes in three ways, all so a
file on disk renders: a `<base>` pointing at the server, the entrance animation
switched off (or the picture is taken mid-fade), and `crossorigin` dropped from
the stylesheet link. With the script left in, `browser-probe` holds the rest —
the same pages adopted and live, over a real socket.

## 7. Wiring an app

1. `server/document.ts`: call `renderDocument` with the kit's registry bound to
   `renderSnapshot` (`@niscorp/moss/terminal/react/server`), and
   `htmlAttributes` for anything the kit puts on `<html>` from an effect.
2. The route: a vite middleware in dev (run `index.html` through
   `transformIndexHtml` first), a Hono route over the built terminal in
   production — which is what `nisc start` mounts (moss's `mountSite`), so an
   app with a `nisc.config.ts` writes no production route at all.
3. `main.tsx`: `createWire({ env: browserEnv({ cookie: true }), initial: readDocumentSnapshot() })`.
4. Every sign-in handoff that stores the token sets the cookie too.
5. A check: draw the page, open it with the real wire and target, assert the
   terminal said nothing — at each window width the kit distinguishes.
6. Record it in the app's `PLAN.md` (D5), with the consequences.
7. `nisc.config.ts` at the root — `boot` and the same `draw` — and the command
   builds, exports and serves it.

## 8. An app with its own shell (2026-10-03)

**What was wrong.** Everything above draws a shell that moss holds. The first
site built on it showed the gap: an exported page was a picture. Nothing in the
browser could take it over, because the only thing that could was a terminal
looking for a socket. The request had been for what every app before moss
already was — mythos, fable: a nova shell in the page, with its own endpoints —
arriving as markup for a crawler and then running as itself. Several rounds of
design tried to get there through moss (shell images, recorded reads, a page
cache). All of them were the wrong end: nova does not care where its shell
lives, and an endpoint is a contract, not a server.

**What it is.** The app's own boot runs twice. At build, where there is no
browser: boot, wait until nothing is still mounting, draw to markup with the
adapter's string renderer. In the page: boot, wait the same way, adopt the
markup. From there the app is what it always was.

**What it took.**

- nova: the seven shell-backed React hooks pass a server snapshot (they threw
  under `renderToString`); `shellView(shell)` reads a local shell as a
  `RenderApi`; `shellSettled(shell)` is the "first screen is whole" signal moss
  had privately; `mountShell` and `adapters/dom/server` for the DOM adapter.
  Vue needed nothing. Moss now uses nova's copies.
- cli: `nisc.config.ts` may hand over `shell` + `draw` + `adopt` instead of a
  moss server. `build` checks every path — drawn, whole, same twice, adopted —
  and fails on any; `export` writes the folder; `start` draws per request.
  The adoption check is a process of its own with a DOM in it (jsdom, the
  app's), because an adapter decides what it is running in when it is imported.
- mythos: `nisc.config.ts`, `ui/screen.tsx` (the frame, shared by build, page
  and dev), and an entry that adopts when the root arrived drawn.

**What was measured.** Mythos (React, PGlite, vex, all in the page): one path,
all four checks hold, 26 KB of markup in `out/index.html`. With one word of the
drawn markup changed on purpose the build fails with React's own hydration
error. The DOM-adapter path is the cli's test fixture (no framework, no moss):
each check is seen to hold, and to fail when the fixture is broken that way.

**In a real browser** (2026-10-03, the exported folder on a static host): with
the script removed the page is whole — 26 KB, every todo, styled. With it, every
delivered element was tagged at 196ms, before any script ran; React took over
at 5.6s (PGlite's boot) and kept all 185 of them, markup unchanged, console
silent. Completing a todo went through the page's own shell into the database
in the page, and the counters and the garden followed. `nisc start` answered
the same screen per request, adopted the same way.

The first run in the browser failed, and the build's checks had passed it:
vite's production build rewrites `globalThis.process.env` to `{}`, PGlite
reads that as "in Node" and touches `process` — a ReferenceError at boot, so
the drawn page never came alive. Mythos had only ever run under `vite dev`.
Fixed in mythos's `vite.config.ts`. **The gap it shows:** "adopted" proves the
markup matches the app's own boot, run in Node — not that the BUNDLE boots in a
browser. Closing it means `nisc build` opening the exported folder in a
headless browser; not built.
