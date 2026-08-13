import { defineApp } from '@niscorp/moss';
import type { NiscApp } from '@niscorp/moss';
import { DEFAULT_PHRASE_KEYS } from '@niscorp/nova/i18n';
import { CHARTER } from './charter/charter';
import { AREAS, areasFor, landingFor } from './nav/sections';
import { CATALOG_DEFINITIONS } from './action-catalog';
import { frameLayout } from './shell/frame.layout';
import { sheetFragment } from './shell/sheet.fragment';
import { ENTRIES, MUTATION_ENTRIES } from './vex';
import { scopeBehaviors } from './vex/behaviors';
import { RESOURCES } from './vex/resources';
import { authFunctions } from '@lyra/server/functions/auth';
import { worldFunctions } from '@lyra/server/functions/world';
import { automationFunctions } from '@lyra/server/functions/automations';
import { navFunctions } from '@lyra/server/functions/nav';
import { loadDirectory } from '@lyra/server/users';

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

export type Directory = {
  person: (principal: string | null) => { id: string; name: string; studioId: string; studioName: string; audience: string; studioPersonId: string | null } | undefined;
  everyone: () => { id: string; name: string; email: string; studioId: string; studioName: string; audience: string; studioPersonId: string | null }[];
  themeFor: (studioId: string) => { name: string; tokens: Record<string, string> };
  /** Integration ids installed for this principal's studio. */
  installedFor: (principal: string | null) => readonly string[];
  /** The principal an integration acts as at a studio — null refuses. */
  integrationActor: (integration: string, studioId: string) => string | null;
  /** Every role a person holds — staff, member, or both. */
  rolesOf: (person: { audience: string; studioPersonId: string | null }) => readonly string[];
  /** The studio's own day, as YYYY-MM-DD. The database computes the same value in `studio_today()`. */
  todayFor: (studioId: string) => string;
  /** How far ahead a read looks, on the same clock. */
  horizonFor: (studioId: string) => string;
  /** Where a studio trades, ISO-3166 alpha-2 — decides payment methods and which law applies. */
  countryFor: (studioId: string) => string;
  /** What language a studio reads in, BCP-47 — decides its words AND its number
   *  and date formatting. The two travel together on purpose: `de-AT` picks
   *  German wording and Austrian money, and splitting them is how a screen ends
   *  up German with American dates. */
  localeFor: (studioId: string) => string;
  /** The words for a language, source phrase → translation. */
  phrasesFor: (locale: string) => Readonly<Record<string, string>>;
  /** Which languages this deployment holds words for — the switcher's options. */
  localesFor: () => readonly string[];
  /** "Guten Morgen, Maren" — the fixed half from the book, the name after it. */
  greetingFor: (name: string, studioId: string) => string;
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

// Derived rather than authored: people arrive at the speed of sign-ups, not
// releases. First thing that moves to rows when the artifact layer lands.
const assignmentsFrom = (directory: Directory): Record<string, readonly string[]> => {
  const assignments: Record<string, readonly string[]> = {};
  for (const person of directory.everyone()) {
    const rung = integrationRung(person.id);
    assignments[person.id] = rung === undefined ? directory.rolesOf(person) : [rung];
  }
  return assignments;
};

export const buildLyra = (directory: Directory, deps: ServerDeps): NiscApp => {
  const assignments = assignmentsFrom(directory);
  const app: NiscApp = defineApp({
    charter: CHARTER,
    assignments,
    actions: CATALOG_DEFINITIONS,

    entries: [...ENTRIES, ...MUTATION_ENTRIES],
    behaviors: scopeBehaviors,
    resources: RESOURCES,

    // A grant from `ext.*` is deployment-wide; an installation is not. Moss
    // drops every integration action outside this list.
    installedIntegrations: (principal) => directory.installedFor(principal),
    // An actor exists exactly as long as the install does, so one appearing
    // mid-process registers its assignment at first use.
    integrationActor: (integration, actsFor) => {
      const actor = directory.integrationActor(integration, actsFor);
      if (actor !== null && app.assignments[actor] === undefined) {
        // The same derivation the snapshot uses, so an actor that appears
        // mid-process lands on the rung its pack would have had at boot — a
        // second spelling here is how `stripe` would quietly become
        // `integration` for exactly the installs nobody restarted for.
        (app.assignments as Record<string, readonly string[]>)[actor] = [integrationRung(actor) ?? 'integration'];
      }
      return actor;
    },

    attachable: { 'people.detail': { person_id: 'personId', person_name: 'member.person_name' } },
    // A pack may place a screen into these and nowhere else — intake refuses a
    // placement naming anything absent here. `hub.money` is offered because a
    // payments pack has somewhere to belong that is not somebody's roster.
    menuSlots: ['hub.people', 'hub.me', 'hub.money'],
    // The same ids, in the words this studio's own navigation uses — so the
    // approval card and the store tile say "under Money" rather than
    // "under hub.money". Derived from the nav rather than typed twice.
    placementNames: { ...Object.fromEntries(AREAS.map((area) => [area.id, area.label])), 'people.detail': 'a member’s record' },
    scope: (principal) => {
      const studioId = directory.person(principal)?.studioId ?? '';
      const person = directory.person(principal);
      return {
        studioId,
        // Set only for people the studio KNOWS (the anchor row) — staff-only
        // principals and integration actors get '', which is what a pack's
        // "only somebody the studio knows can pay" check keys on.
        personId: person?.studioPersonId !== null && person !== undefined ? person.id : '',
        // Travels in the assertion, so an installed pack learns where a studio
        // trades without asking it and without a country ever being sent by a
        // browser. The payments pack held this as a constant until now.
        country: directory.countryFor(studioId),
        // Travels in the assertion for the same reason `country` does, and is
        // read by every vex mapping that renders a date or an amount
        // (`prisms/format.prism.ts`). Engine-side, so a browser cannot ask to
        // be shown a different studio's money in its own language.
        locale: directory.localeFor(studioId),
        today: directory.todayFor(studioId),
        horizon: directory.horizonFor(studioId),
        automationActor: studioId === '' ? '' : `automation@${studioId}`,
      };
    },

    // THE WORDS EACH SHELL WEARS. moss applies these in one pass over the
    // rendered frame, so nothing below this line — no action, no layout, no
    // component — knows a second language exists.
    //
    // Anonymous principals get the login screen in the source language. That
    // is a real gap and a deliberate one: who is reading is not known until
    // they sign in, and guessing from an Accept-Language header would mean the
    // one screen in the app whose language is a guess. See the design doc.
    phrases: (principal) => {
      const person = directory.person(principal);
      return person === undefined ? undefined : directory.phrasesFor(directory.localeFor(person.studioId));
    },
    // THIS APP'S DISPLAY-FIELD CONVENTION, declared once.
    //
    // Every read that manufactures a word for a screen writes it to a
    // `*_display` field (`status_display`, `term_display`, `paid_via_display`)
    // — a convention the vex entries already followed for their own reasons.
    // Naming it here is what makes the closed-set vocabulary a query invents
    // translatable without listing forty field names, and without the pass
    // ever touching a person's name or a plan's title.
    // Four keys added to nova's default prose props, each for a place this app
    // renders words that arrive as ROW DATA rather than as layout literals:
    //   role     — the identity card shows a role LABEL ("Front desk"), not an id
    //   phrase   — the automation vocabulary tables (`somebody joins`)
    //   why      — a recipe card's body
    //   sentence — a recipe card's subtitle, composed from moment + effect
    //
    // Deliberately NOT added: anything a form is about to SAVE. A recipe's
    // email subject and body reach the screen as `Input` values, and `value` is
    // not a prose key — translating one would show German and save English.
    // That line is the difference between chrome and content: this pass owns
    // the words the application says, never the words a studio wrote.
    phraseKeys: {
      props: [...DEFAULT_PHRASE_KEYS.props, 'role', 'phrase', 'why', 'sentence'],
      suffixes: ['_display'],
    },

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
          for (const person of directory.everyone()) {
            if (person.studioId !== studioId) continue;
            if (person.audience !== 'owner' && person.audience !== 'manager' && person.audience !== 'desk') continue;
            deliver(person.id, 'notified');
          }
        },
      },
      // An add-on landing or leaving changes what the directory derives —
      // installed integrations, catalogs, actor rungs. The resync rides the
      // WRITE, whoever caused it (the store screen, a pack, a check),
      // instead of every caller remembering to poke a function afterwards.
      {
        table: 'studio_integrations',
        run: () => {
          void (async () => {
            await loadDirectory(deps.pool);
            deps.server().refresh();
          })();
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
      chain: (scope, hints) => (directory.person(String(scope['userId'] ?? ''))?.audience === 'automation' ? hints : undefined),
    },

    // `world.refresh` re-derives assignments with the SAME `assignmentsFrom`
    // boot uses — injected, so a refresh cannot disagree with a restart. (Its
    // predecessor rebuilt from `[audience]` alone, and an instructor who also
    // trains lost their member role until the next boot.)
    functions: (session) => ({ ...authFunctions(session), ...worldFunctions(session, { pool: deps.pool, app, server: deps.server, assignments: () => assignmentsFrom(directory), studioOf: (principal) => directory.person(principal)?.studioId ?? '' }), ...automationFunctions(session, { tide: deps.tide, driver: deps.driver, pool: deps.pool, server: deps.server }), ...navFunctions(session, { app, directory, pool: deps.pool }) }),

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
      inputs: ({ principal, actions: granted }): Record<string, Record<string, unknown>> => {
        const person = directory.person(principal);

        const homeId = ['home.overview', 'home.desk', 'home.classes', 'home.member'].find((id) => granted.includes(id)) ?? '';

        const trains = person !== undefined && person.studioPersonId !== null;
        const MEMBER_ONLY = new Set(['hub.me']);

        const offered = areasFor(granted).filter((area) => trains || !MEMBER_ONLY.has(area.id));
        const areas = offered.map((area) => ({ action: landingFor(area), areaId: area.id, label: area.label, icon: area.icon ?? '' }));

        const home = { action: homeId, areaId: homeId, label: 'Today', icon: 'home' };
        const primaryAreas = [home, ...areas].slice(0, 4);

        if (person === undefined) {
          return {
            main: {
              // Automations and integration actors never log in, so they are not
              // on the one screen whose whole job is logging in.
              people: directory
                .everyone()
                .filter((p) => p.audience !== 'automation' && p.audience !== 'integration')
                .map((p) => ({ id: p.id, name: p.name, email: p.email, studio: p.studioName, role: ROLE_LABEL[p.audience] ?? 'Member' })),
            },
          };
        }

        const theme = directory.themeFor(person.studioId);

        // The opening paint's greeting. `nav.identity` recomputes it on mount
        // with the SAME composer (server/phrases.ts) — two spellings of one
        // sentence is how a screen greets somebody in German on load and in
        // English a tick later.
        const greeting = directory.greetingFor(person.name, person.studioId);

        return {
          chrome: {
            studioName: person.studioName,
            personName: person.name,
            roleLabel: ROLE_LABEL[person.audience] ?? 'Member',
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
          main: { studioId: person.studioId, studioName: person.studioName, personName: person.name, greeting },
        };
      },
    },
  });

  return app;
};
