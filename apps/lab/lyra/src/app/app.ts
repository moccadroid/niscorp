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
import { installedFor, integrationActorFor, localeOf, personCard, studioOf } from '@lyra/server/lookup';
import { themeFor } from '@lyra/server/themes';
import { greetingFrom, phrasesFor } from '@lyra/server/phrases';

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

// WHICH RUNG A PACK ACTS ON, derived from the actor's own id.
//
// An integration actor is `ig_<integration>@<studio>` — the id names the pack,
// so the rung can too. A pack with a rung of its own gets it; everything else
// shares `integration`, which holds almost nothing.
//
// This is what keeps a payments pack's grants away from a rank tracker. Without
// it every installed pack is the same principal shape, and widening the shared
// rung for one of them widens it for all of them.
const integrationRung = (actorId: string): string | undefined => {
  if (!actorId.startsWith('ig_')) return undefined;
  const pack = actorId.slice('ig_'.length).split('@')[0] ?? '';
  return pack !== '' && CHARTER[pack] !== undefined ? pack : 'integration';
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
// drifts — a pack gaining a rung would have to be remembered in two places, and
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

    // A grant from `ext.*` is deployment-wide; an installation is not. Moss
    // drops every integration action outside this list.
    installedIntegrations: (principal) => installedFor(deps.pool, principal),
    // An actor exists exactly as long as the install does, so one appearing
    // mid-process registers its assignment at first use.
    // An actor exists exactly as long as its install does. Nothing is
    // registered here any more: `identity` resolves the rung from the actor's
    // own id on the first call, so a pack installed after boot needs no
    // bookkeeping to be recognised.
    integrationActor: (integration, actsFor) => integrationActorFor(deps.pool, integration, actsFor),

    attachable: { 'people.detail': { person_id: 'personId', person_name: 'member.person_name' } },
    // A pack may place a screen into these and nowhere else — intake refuses a
    // placement naming anything absent here. `hub.money` is offered because a
    // payments pack has somewhere to belong that is not somebody's roster.
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
    identity: (principal) => identityFor(deps.pool, principal, integrationRung),
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
    phrases: async (principal) => {
      // One book, for the language this principal's studio reads in. Read when
      // the shell is built, which is the only moment it can matter.
      const studioId = await studioOf(deps.pool, principal);
      if (studioId === '') return undefined;
      return phrasesFor(deps.pool, await localeOf(deps.pool, studioId));
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
      // pack's grading, a dunning outcome, an automation's note — so it fans
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
            for (const live of deps.server().shells?.list() ?? []) {
              const person = await personCard(deps.pool, live.principal);
              if (person === undefined || person.studioId !== studioId) continue;
              if (person.audience !== 'owner' && person.audience !== 'manager' && person.audience !== 'desk') continue;
              deliver(person.id, 'notified');
            }
          })().catch((err: unknown) => console.error('[lyra:notify]', err));
        },
      },
      // An add-on landing or leaving changes what the directory derives —
      // installed integrations, catalogs, actor rungs. The resync rides the
      // WRITE, whoever caused it (the store screen, a pack, a check),
      // instead of every caller remembering to poke a function afterwards.
      {
        table: 'studio_integrations',
        run: () => {
          // Nothing to reload: installs are read when they are asked about.
          // `refresh` is still right — it drops every derivation made under the
          // old install set and moves the generation pointer, so the other
          // processes forget too.
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
    functions: (session) => ({ ...authFunctions(session, { pool: deps.pool, now: () => Date.now(), base: () => process.env['LYRA_BASE'] ?? 'http://localhost:5180' }), ...worldFunctions(session, { pool: deps.pool, app, server: deps.server, studioOf: (principal) => studioOf(deps.pool, principal) }), ...automationFunctions(session, { tide: deps.tide, driver: deps.driver, pool: deps.pool, server: deps.server }), ...navFunctions(session, { app, pool: deps.pool }), ...mailFunctions({ pool: deps.pool, studioOf: (principal) => studioOf(deps.pool, principal) }, session.principal) }),

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
      inputs: async ({ principal, actions: granted, identity }): Promise<Record<string, Record<string, unknown>>> => {
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
          if (process.env['LYRA_DEV_LOGIN'] !== 'on') return { main: { people: [] } };
          return {
            main: {
              // Automations and integration actors never log in, so they are not
              // on the one screen whose whole job is logging in.
              // The one query in this application that reads a population, in
              // the one place whose job is offering a choice of who to be, and
              // only when the environment says this is a lab.
              people: (
                await deps.pool.query(/* sql */ `
                  SELECT p.id, p.name, p.email, st.name AS studio, COALESCE(sf.role, 'member') AS role
                  FROM people p
                  LEFT JOIN staff sf ON sf.person_id = p.id AND sf.active
                  LEFT JOIN studio_people sp ON sp.person_id = p.id
                  JOIN studios st ON st.id = COALESCE(sf.studio_id, sp.studio_id)
                  WHERE COALESCE(sf.role, '') NOT IN ('automation')
                  ORDER BY p.name
                `)
              ).rows.map((r) => ({ id: String(r['id']), name: String(r['name']), email: String(r['email']), studio: String(r['studio']), role: ROLE_LABEL[String(r['role'])] ?? 'Member' })),
            },
          };
        }

        const theme = await themeFor(deps.pool, studioId);
        const book = await phrasesFor(deps.pool, str('locale'));

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
