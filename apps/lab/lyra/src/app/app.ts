import { defineApp } from '@niscorp/moss';
import type { NiscApp } from '@niscorp/moss';
import { CHARTER } from './charter/charter';
import { AREAS, areasFor, landingFor } from './nav/sections';
import { CATALOG_DEFINITIONS } from './action-catalog';
import { PHRASE_KEYS } from './phrase-keys';
import { frameLayout } from './shell/frame.layout';
import { sheetFragment } from './shell/sheet.fragment';
import { ENTRIES, MUTATION_ENTRIES } from './vex';
import { scopeBehaviors } from './vex/behaviors';
import { RESOURCES } from './vex/resources';
import { authFunctions } from '@lyra/server/functions/auth';
import { mailFunctions } from '@lyra/server/functions/mail';
import { worldFunctions } from '@lyra/server/functions/world';
import { automationFunctions } from '@lyra/server/functions/automations';
import { navFunctions } from '@lyra/server/functions/nav';
import { identityFor } from '@lyra/server/identity';
import { clockScope } from '@lyra/server/clock';
import { readDevLoginRoster } from '@lyra/server/dev-login';
import { greetingFrom } from '@lyra/server/phrases';
import type { Phrasebook } from '@lyra/server/phrases';

// The source language, which needs no rows. One frozen object rather than a
// fresh `{}` per call: it is handed out on every English shell build.
const EMPTY_BOOK: Phrasebook = Object.freeze({});

export type ServerDeps = {
  pool: import('@niscorp/vex').PgPool;
  // Late-bound: the manifest is built before the server exists, and the ACL
  // refresh needs the server. A getter closes that circle.
  server: () => import('@niscorp/moss').MossServer;
  // Late-bound too — tide's seams call the server's own vex surface.
  tide: () => import('@niscorp/tide').Tide;
  // The driver around it: the waking intake the bridge mints through, and
  // the verb the automations screen fires.
  driver: () => import('@niscorp/moss').TideDriver;
  // Re-read the automation rows into tide. Late-bound like everything else
  // here; the `automations` reaction is its only caller.
  reloadAutomations: () => Promise<number>;
};

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', manager: 'Manager', instructor: 'Instructor', desk: 'Front desk', member: 'Member', automation: 'Automation', integration: 'Integration' };

// ── engine reads the shell composes from, over the session's own wire ──
//
// The shell's derivation hooks (`inputs`, `phrases`) read entries exactly as a
// terminal would: same surface, same policy, same fences. These helpers are
// the only spelling of that call, so a screen and a shell can never disagree
// about how an entry is asked for.
type Wire = import('@niscorp/nova').FetchFn;

export const readEntry = async (wire: Wire, fingerprint: string, context: Record<string, unknown>): Promise<unknown> => {
  const response = await wire('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint, context }) });
  if (!response.ok) return undefined;
  return response.json();
};

/** One language's book, folded: approved integrations' words first (`phrases/integrations`),
 *  the app's own rows OVER them (`phrases/book`) — so an integration can never rename
 *  a word the host already owns. */
const integrationWords = (held: unknown): Record<string, string> => {
  const words: Record<string, string> = {};
  if (!Array.isArray(held)) return words;
  for (const one of held) {
    if (one === null || typeof one !== 'object' || Array.isArray(one)) continue;
    for (const [source, text] of Object.entries(one as Record<string, unknown>)) words[source] = String(text);
  }
  return words;
};

const foldOverWire = async (wire: Wire, language: string, words: Record<string, string>): Promise<Phrasebook> => {
  const book: Record<string, string> = { ...words };
  const rows = await readEntry(wire, 'phrases/book', { locale: language });
  if (Array.isArray(rows)) for (const row of rows as { source?: unknown; text?: unknown }[]) book[String(row.source ?? '')] = String(row.text ?? '');
  // FROZEN BECAUSE IT IS SHARED. Every shell reading this language holds this
  // very object, so a caller mutating it would edit a language for everybody
  // at once. Freezing turns that from a bug somebody finds in production into
  // a throw in the line that wrote it.
  return Object.freeze(book);
};

// ONE BOOK PER LANGUAGE, not one per shell.
//
// This answers a measurement rather than a hunch. `moss-bench` put per-shell
// birth cost at 80.6 KB before this application spoke a second language and
// 138.8 KB after, with build time up from 20.7 to 50.5 ms each — and both
// numbers were this fold. Every de-AT shell ran two engine reads and then kept
// its own copy of ~560 rows: 66 KB of strings that are byte-identical across
// every shell in the deployment, because a book is derived from the LANGUAGE
// and nothing else. `phrases` is release vocabulary owned by no tenant, and
// `phrases/integrations` filters on `status = 'approved'` rather than on who
// installed what (language.entries.ts says so and means it), so two studios
// reading German cannot be handed different books.
//
// WHAT IS SHARED IS THE ANSWER, NEVER THE PATH TO IT — the fair question here
// being whether `BY_LOCALE` is walking back in, since that cache is on
// held-state-check's deletion list and this file is in its scan. BY_LOCALE held
// every language eagerly at boot so a SYNCHRONOUS seam could answer, and that
// seam is what put the rows out of vex's reach. This holds one language,
// lazily, folded THROUGH the entries over the caller's own wire and under the
// caller's own policy. It is the fourth kind the check names: keyed over a
// space bounded by a standard rather than by the population.
//
// AND IT CANNOT SERVE A STALE INTEGRATION SET, which is the part worth paying
// for. The integration half is re-read on every call — a handful of rows — and
// its content IS the memo key, so an operator approving Stripe at 09:00 gets a
// refold on the next shell rather than English until somebody restarts the
// process. Only the app's own ~560 rows are held, and those have no runtime
// write path at all: `phrases` is written by the seed and by nothing else. If
// one is ever added, this is the line that needs a reaction on that table.
//
// The PROMISE is held rather than the book, so 250 shells opening at once share
// one fold instead of starting 250 — which is where the 50.5 ms went.
const FOLDED: Record<string, { key: string; book: Promise<Phrasebook> }> = {};

export const bookOverWire = async (wire: Wire, locale: string): Promise<Phrasebook> => {
  const language = locale.split('-')[0] ?? '';
  if (language === '' || language === 'en') return EMPTY_BOOK;
  const words = integrationWords(await readEntry(wire, 'phrases/integrations', { locale: language }));
  // ONE ENTRY PER LANGUAGE, always the current one: a changed integration set
  // REPLACES the fold rather than adding a second, so this cannot grow a
  // generation of dead books behind it.
  const key = JSON.stringify(words);
  const held = FOLDED[language];
  const folding = held !== undefined && held.key === key ? held.book : foldOverWire(wire, language, words);
  FOLDED[language] = { key, book: folding };
  try {
    return await folding;
  } catch (err) {
    // A FAILED READ MUST NOT BECOME THE LANGUAGE. Caching the rejection would
    // serve one bad moment for the life of the process, so the slot goes on the
    // way out and the next shell tries again.
    if (FOLDED[language]?.book === folding) delete FOLDED[language];
    throw err;
  }
};

/** Drop the folded books — for a check that needs to watch one being rebuilt. */
export const forgetBooks = (): void => {
  for (const language of Object.keys(FOLDED)) delete FOLDED[language];
};

/** The session studio's look — `studio/theme`, stock when it names none. */
const themeOverWire = async (wire: Wire): Promise<{ name: string; tokens: Record<string, string> }> => {
  const raw = await readEntry(wire, 'studio/theme', {});
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { name: 'stock', tokens: {} };
  const row = raw as { name?: unknown; tokens?: unknown };
  const tokens: Record<string, string> = {};
  if (row.tokens !== null && typeof row.tokens === 'object' && !Array.isArray(row.tokens)) {
    for (const [key, value] of Object.entries(row.tokens as Record<string, unknown>)) if (typeof value === 'string') tokens[key] = value;
  }
  const name = String(row.name ?? '');
  return name === '' ? { name: 'stock', tokens: {} } : { name, tokens };
};

// WHICH RUNG AN INTEGRATION ACTS ON, derived from the actor's own id.
//
// An integration actor is `ig_<integration>@<studio>` — the id names the integration,
// so the rung can too. An integration with a rung of its own gets it; everything else
// shares `integration`, which holds almost nothing.
//
// This is what keeps a payments integration's grants away from a rank tracker. Without
// it every installed integration is the same principal shape, and widening the shared
// rung for one of them widens it for all of them.
const integrationRung = (actorId: string): string | undefined => {
  if (!actorId.startsWith('ig_')) return undefined;
  const integration = actorId.slice('ig_'.length).split('@')[0] ?? '';
  return integration !== '' && CHARTER[integration] !== undefined ? integration : 'integration';
};

// THE ROLE COMBINATIONS SOMEBODY CAN WEAR — the PAIRS, and only the pairs.
//
// The coherence gates want the set of combinations this application can
// produce. They used to read it off `assignments`, which meant walking the
// population to learn a fact with nothing to do with how many people there are:
// at hundreds of studios, six hundred thousand entries collapsing to four.
//
// SINGLE roles are deliberately absent. `verifyVariants` already iterates every
// role in the charter on its own, so listing them here would be noise that
// drifts — an integration gaining a rung would have to be remembered in two places, and
// the one that was forgotten would be this one.
//
// What no other document can derive is which roles COINCIDE on one person, and
// that is a fact about two tables rather than about the grants: `rolesOf` in
// server/users.ts adds `member` to a staff role when the studio also KNOWS them
// (a `studio_people` anchor beside the `staff` row). An instructor who trains
// is the case; a robot is not, which is why `automation` is not paired here.
const DUAL = ['owner', 'manager', 'instructor', 'desk'] as const;
const WEARABLE: readonly (readonly string[])[] = DUAL.map((role) => [role, 'member']);

export const buildLyra = (deps: ServerDeps): NiscApp => {
  const app: NiscApp = defineApp({
    charter: CHARTER,
    // NO ASSIGNMENT MAP. `identity` below answers per principal, one row at a
    // time — which is the whole of what this plan was about. The map existed
    // only because an eager `Record` cannot be filled without enumerating
    // everybody, and enumerating everybody is what made a directory a database.
    wearable: WEARABLE,
    actions: CATALOG_DEFINITIONS,

    entries: [...ENTRIES, ...MUTATION_ENTRIES],
    behaviors: scopeBehaviors,
    resources: RESOURCES,

    // `installedIntegrations` is gone as a question: the install list lives on
    // the identity record (`identity/installed`), resolved once per session
    // through the engine, and moss's surfaces read the record.
    //
    // The actor seam is PURE now — the id names both halves, so composing it
    // reads nothing. Whether the install is live is identity's question:
    // `identity/actor` answers it when the record resolves, and moss refuses
    // the keyed call at the door when it answers nobody.
    integrationActor: (integration, actsFor) => (integration === '' || actsFor === '' ? null : `ig_${integration}@${actsFor}`),

    attachable: { 'people.detail': { person_id: 'personId', person_name: 'member.person_name' } },
    // An integration may place a screen into these and nowhere else — intake refuses a
    // placement naming anything absent here. `hub.money` is offered because a
    // payments integration has somewhere to belong that is not somebody's roster.
    menuSlots: ['hub.people', 'hub.me', 'hub.money'],
    // The same ids, in the words this studio's own navigation uses — so the
    // approval card and the store tile say "under Money" rather than
    // "under hub.money". Derived from the nav rather than typed twice.
    placementNames: { ...Object.fromEntries(AREAS.map((area) => [area.id, area.label])), 'people.detail': 'a member’s record' },
    // WHO SOMEBODY IS, resolved once per session and held by moss.
    //
    // Everything here is stable for as long as a session lasts: which studio,
    // which anchor, where it trades, what it reads and prices in. Nothing here
    // is derived from the clock — that is `scope` below, and the split is the
    // point rather than an accident of tidiness.
    // WHO SOMEBODY IS — ONE ROW, read on demand for whoever presented a token.
    //
    // Not a lookup into a resident map: `server/identity.ts` queries for this
    // principal and nobody else. That is the whole of what Part 4 licenses, and
    // it is available at all only because this seam is async — the six
    // synchronous ones around it could not have been implemented any other way
    // than by holding the population, which is how Lyra grew eight caches
    // nobody decided on.
    identity: {
      // The reader role — a charter role nobody wears, holding exactly the
      // verbs identity's engine reads need. Moss lends `read` bound to it.
      as: 'identity',
      // ONE licensed statement lives behind this (`server/identity.ts`, the
      // roles read); everything else the record carries arrives through `read`
      // — engine executions of the seeded identity entries, each pinned to the
      // caller by the `identity` reach in behaviors.ts.
      resolve: (principal, read) => identityFor(deps.pool, principal, integrationRung, read),
    },
    // WHAT THE CLOCK SAYS, and nothing else — asked per request, deliberately.
    //
    // These two sat in `scope` beside the rest until identity became a
    // per-session record, and folding them in would have frozen them: a session
    // opened at 23:58 would go on telling every read it was yesterday, including
    // the ones the database compares a DATE column against. A studio's day is
    // not part of who anybody is.
    //
    // Synchronous is right here for the reason it was wrong everywhere else —
    // this is COMPUTED, not read. The zone comes off the record the session
    // already resolved, so there is no lookup behind it and no cache under it.
    scope: (_principal, identity) => clockScope(String(identity?.scope['timezone'] ?? '')),

    // THE WORDS EACH SHELL WEARS. moss applies these in one pass over the
    // rendered frame, so nothing below this line — no action, no layout, no
    // component — knows a second language exists.
    //
    // Anonymous principals get the login screen in the source language. That
    // is a real gap and a deliberate one: who is reading is not known until
    // they sign in, and guessing from an Accept-Language header would mean the
    // one screen in the app whose language is a guess. See the design doc.
    phrases: async ({ principal, identity, wire }) => {
      // The language is on the record the session already resolved; the book
      // is an engine read over the session's own wire, at shell build — the
      // only moment it can matter. The source language needs no book.
      if (principal === null) return undefined;
      const book = await bookOverWire(wire, String(identity['locale'] ?? ''));
      return Object.keys(book).length === 0 ? undefined : book;
    },
    // THIS APP'S DISPLAY-FIELD CONVENTION — shared with the harvest, so the
    // pass and the report can never disagree about what counts as prose. The
    // convention itself, and what is deliberately absent from it, is argued
    // in `phrase-keys.ts`.
    phraseKeys: PHRASE_KEYS,

    // WRITES THIS APP REACTS TO, declared by table — moss routes the write
    // observer here, row-less, and nothing below ever string-matches a
    // fingerprint to find out what happened.
    reactions: [
      // A notification landing means "the studio was told something" — a
      // integration's grading, a dunning outcome, an automation's note — so it fans
      // out to the studio's connected STAFF over the socket their shells
      // already run: the chrome hears 'notified', bumps the bell, re-reads
      // the count. Whoever holds no live shell hears nothing and reads the
      // rows later; the insert is the durable fact, the push only the news.
      //
      // Staff only, and only the rungs that hold the Notices screen — a
      // member's shell has no bell, and an instructor's rung cannot read
      // the table.
      {
        table: 'notifications',
        op: 'insert',
        run: ({ scope }, { deliver }) => {
          const studioId = String(scope['studioId'] ?? '');
          if (studioId === '') return;
          // THE ROSTER, NOT THE POPULATION. `deliver` only ever reaches somebody
          // holding a live shell, so the set worth walking is the one moss
          // already owns — bounded by who is connected, not by how many people
          // the deployment knows. Each live principal costs one point lookup.
          // Asynchronously, because naming who is connected is a read now
          // rather than a map hit — and a push is news, not a transaction. The
          // insert is the durable fact; whoever is not reached simply reads the
          // rows later, which was always true.
          void (async () => {
            const HEARS = new Set(['owner', 'manager', 'desk']);
            for (const live of deps.server().shells?.list() ?? []) {
              // The app reading back its own records — one live principal at a
              // time, through the same cache the request path uses.
              const record = await deps.server().identity(live.principal);
              if (String(record.scope['studioId'] ?? '') !== studioId) continue;
              if (!record.roles.some((role) => HEARS.has(role))) continue;
              deliver(live.principal, 'notified');
            }
          })().catch((err: unknown) => console.error('[lyra:notify]', err));
        },
      },
      // An add-on landing or leaving changes what the directory derives —
      // installed integrations, catalogs, actor rungs. The resync rides the
      // WRITE, whoever caused it (the store screen, an integration, a check),
      // instead of every caller remembering to poke a function afterwards.
      {
        table: 'studio_integrations',
        run: ({ scope }) => {
          // TENANT-LOCAL, at last. An integration landing at one studio changes what
          // THAT studio's people may see and nothing about anybody else's, so
          // this forgets that studio's identities and rebuilds their shells —
          // rather than dropping every principal's record in the deployment,
          // which is what `refresh()` does and what this used to call.
          //
          // The generation pointer still moves (below), because a second
          // process holds its own copies of the same tenant's records and has
          // no other way to hear. Coarse across processes, precise within one;
          // Move 4 is where that last asymmetry goes.
          const studioId = String(scope['studioId'] ?? '');
          if (studioId !== '') deps.server().invalidateTenant(studioId);
          // The integration's ACTIONS are deployment-wide artifacts, so registering
          // them is not a tenant's business and still needs the full refresh.
          deps.server().refresh();
        },
      },
      // An automation row changing means the loaded reflexes are stale —
      // re-reading is the whole point of them being rows: no release, no
      // restart, and no screen remembering to poke a reload afterwards.
      {
        table: 'automations',
        run: () => {
          void deps.reloadAutomations().catch((err: unknown) => console.error('[lyra:automations]', err));
        },
      },
    ],

    // The write-fact bridge: every committed write becomes tide facts,
    // stamped with the identity the write's own scope names — the same
    // `automation@<studioId>` the studio's reflexes run as, so a fact can
    // wake this studio's automations and nobody else's. A write with no
    // studio (an operator surface) names no identity and mints nothing.
    facts: {
      // The DRIVER, not bare tide: a minted fact wakes the engine. Boot-
      // window writes land before it stands up; no driver, no facts —
      // seeding is not an event stream.
      tide: () => {
        try {
          return deps.driver();
        } catch {
          return undefined;
        }
      },
      identity: (scope) => {
        const as = String(scope['automationActor'] ?? '');
        return as === '' ? undefined : as;
      },
      // Chain headers are believed from the automation rungs and nobody
      // else: a forged depth could park an innocent chain, and the robots
      // are the only principals whose writes ARE chain hops.
      // The write's OWN scope says who its automation would be; a write made
      // BY that principal is the one whose chain headers are worth trusting. No
      // lookup: both halves are already on the scope the engine stamped.
      chain: (scope, hints) => (String(scope['userId'] ?? '') === String(scope['automationActor'] ?? '\u0000') ? hints : undefined),
    },

    // `world.refresh` re-derives assignments with the SAME `assignmentsFrom`
    // boot uses — injected, so a refresh cannot disagree with a restart. (Its
    // predecessor rebuilt from `[audience]` alone, and an instructor who also
    // trains lost their member role until the next boot.)
    functions: (session) => ({ ...authFunctions(session, { runAs: (role, fingerprint, context, scope) => deps.server().executeAs(role, fingerprint, context, scope), now: () => Date.now(), base: () => process.env['LYRA_BASE'] ?? 'http://localhost:5180' }), ...worldFunctions(session, { app, server: deps.server }), ...automationFunctions(session, { tide: deps.tide, driver: deps.driver, server: deps.server }), ...navFunctions(session, { app, pool: deps.pool }), ...mailFunctions(session) }),

    shell: {
      // Every canvas needs an explicit `actionLayout` with an `ActionSlot`: the
      // marker carries the instance id a terminal stamps as an event's `origin`,
      // and without it a browser click matches nothing. Headless checks dispatch
      // directly and never catch this — see shell-check.
      canvases: [
        // Candidate lists: the first id the principal actually holds mounts.
        // Nothing branches, and an ungranted candidate is simply absent.
        {
          id: 'chrome',
          initial: ['chrome.staff', 'chrome.member'],
          actionLayout: { if: '$.active', then: { component: 'ActionSlot', props: { instanceId: '$.active.id' } }, else: '' },
        },
        {
          id: 'main',
          // In privilege order — which is why an instructor's shell never even
          // issues the revenue request.
          initial: ['home.overview', 'home.desk', 'home.classes', 'home.member', 'auth.login'],
          actionLayout: {
            if: '$.active',
            then: { component: 'Box', props: { grow: true, h: '100%' }, children: [{ component: 'ActionSlot', props: { instanceId: '$.active.id' } }] },
            else: '',
          },
        },
        {
          // Empty until something is pushed, and an empty canvas renders
          // nothing — so it costs nothing on screens that do not use it.
          id: 'sheet',
          initial: [],
          actionLayout: {
            if: '$.active',
            then: {
              component: 'Sheet',
              props: { open: true, depth: '$.count', title: '$.active.title' },
              ref: 'sheetClose',
              children: [{ component: 'ActionSlot', props: { instanceId: '$.active.id' } }],
            },
            else: '',
          },
        },
      ],
      layout: frameLayout,

      // Composed into anything pushed with `with: ['sheet']` — supplies the
      // escape every overlay must have. See shell/sheet.fragment.ts.
      fragments: { sheet: sheetFragment },

      // Per-principal boot input, resolved once on the server. Everything
      // downstream reads these from action data; a terminal cannot author them.
      inputs: async ({ principal, actions: granted, identity, wire }): Promise<Record<string, Record<string, unknown>>> => {
        // FROM THE RECORD THE SESSION ALREADY RESOLVED. This used to reach into
        // a resident directory for four facts about one person — which is the
        // seam that made the directory exist.
        const str = (key: string): string => String(identity[key] ?? '');
        const studioId = str('studioId');
        const known = principal !== null && studioId !== '';

        const homeId = ['home.overview', 'home.desk', 'home.classes', 'home.member'].find((id) => granted.includes(id)) ?? '';

        const trains = identity['trains'] === true;
        const MEMBER_ONLY = new Set(['hub.me']);

        const offered = areasFor(granted).filter((area) => trains || !MEMBER_ONLY.has(area.id));
        const areas = offered.map((area) => ({ action: landingFor(area), areaId: area.id, label: area.label, icon: area.icon ?? '' }));

        const home = { action: homeId, areaId: homeId, label: 'Today', icon: 'home' };
        const primaryAreas = [home, ...areas].slice(0, 4);

        if (!known) {
          // THE PICKER IS A TRANSPORT, NOT A SURFACE.
          //
          // Signing in is one path — resolve the address, mint a short-lived
          // nonce, hand it over — and the only thing that differs between a
          // deployment and this lab is HOW the nonce reaches the browser: by
          // mail, or by being clickable right here. That fork belongs to the
          // environment, which is where moss already argues this class of knob
          // lives (`runtime.ts`: an operational decision about a deployment,
          // not something an application is written against).
          //
          // Unset means OFF, because the cost of getting this wrong is the
          // entire roster — every name and every email — served to anybody who
          // can reach the login screen. `dev/world.ts` and `server/serve.ts`
          // turn it on; nothing else does. See docs/plans/lyra-identity.md 12.1.
          // The roster query lives in `server/dev-login.ts` — a named
          // no-principal door beside the nonce, gated on the same flag.
          const people = await readDevLoginRoster((role, fingerprint, context, scope) => deps.server().executeAs(role, fingerprint, context, scope));
          return { main: { people: people.map((p) => ({ ...p, role: ROLE_LABEL[p.role] ?? 'Member' })) } };
        }

        const theme = await themeOverWire(wire);
        const book = await bookOverWire(wire, str('locale'));

        // The opening paint's greeting. `nav.identity` recomputes it on mount
        // with the SAME composer (server/phrases.ts) — two spellings of one
        // sentence is how a screen greets somebody in German on load and in
        // English a tick later.
        const greeting = greetingFrom(book, str('name'), new Date());

        return {
          chrome: {
            studioName: str('studioName'),
            personName: str('name'),
            roleLabel: ROLE_LABEL[str('audience')] ?? 'Member',
            homeId,
            home,
            areas,
            primaryAreas,
            // Opening value only, so the first paint is right. `nav.context`
            // confirms it on mount and owns it after.
            currentArea: homeId,
            currentLeaf: homeId,
            themeTokens: theme.tokens,
            themeName: theme.name,
          },
          // `studioId` is seeded, not sent: the settings write names the row it
          // touches, and a browser has no way to author which row that is.
          main: { studioId, studioName: str('studioName'), personName: str('name'), greeting },
        };
      },
    },
  });

  return app;
};
