import { defineApp } from '@niscorp/moss';
import type { NiscApp } from '@niscorp/moss';
import { CHARTER } from './charter/charter';
import { areasFor, landingFor } from './nav/sections';
import { CATALOG_DEFINITIONS } from './action-catalog';
import { frameLayout } from './shell/frame.layout';
import { sheetFragment } from './shell/sheet.fragment';
import { ENTRIES, MUTATION_ENTRIES } from './vex';
import { scopeBehaviors } from './vex/behaviors';
import { RESOURCES } from './vex/resources';
import { authFunctions } from '@lyra/server/functions/auth';
import { staffFunctions } from '@lyra/server/functions/staff';
import { memberFunctions, staffIntakeFunctions } from '@lyra/server/functions/members';
import { automationFunctions } from '@lyra/server/functions/automations';
import { navFunctions } from '@lyra/server/functions/nav';
import { courseFunctions } from '@lyra/server/functions/courses';

// ═══════════════════════════════════════════════════════════
// Lyra, the application, as data.
//
// Everything here is an authored artifact — the policy document, the action
// definitions, the shell's canvases. The server derives the rest from these
// plus a database.
//
// The two things this file DERIVES are `scope` and `inputs`, and both are
// derivations of one fact: which studio a principal belongs to. That is why a
// browser never sends a studio id — the shell runs on the server and already
// knows, and the engine enforces it whether or not any layout cooperates.
// ═══════════════════════════════════════════════════════════

export type ServerDeps = {
  // Late-bound: the manifest is built BEFORE the server exists, and the ACL
  // refresh needs the server. A getter closes that circle without a mutable
  // module-level reference.
  pool: import('@niscorp/vex').PgPool;
  server: () => import('@niscorp/moss').MossServer;
  // Late-bound for the same reason: tide is created after the server, because
  // its seams call the server's own vex surface.
  tide: () => import('@niscorp/tide').Tide;
};

export type Directory = {
  person: (principal: string | null) => { id: string; name: string; studioId: string; studioName: string; audience: string; membershipId: string | null } | undefined;
  everyone: () => { id: string; name: string; email: string; studioName: string; audience: string; membershipId: string | null }[];
  themeFor: (studioId: string) => { name: string; tokens: Record<string, string> };
  /** Integration ids installed for this principal's studio. */
  installedFor: (principal: string | null) => readonly string[];
  /** The principal an integration acts as at a studio — null refuses. */
  integrationActor: (integration: string, studioId: string) => string | null;
  /** Every role a person holds — staff, member, or both. */
  rolesOf: (person: { audience: string; membershipId: string | null }) => readonly string[];
  /** The studio's own day, as YYYY-MM-DD. The database computes the same value in `studio_today()`. */
  todayFor: (studioId: string) => string;
  /** How far ahead a read looks, on the same clock. */
  horizonFor: (studioId: string) => string;
};

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', manager: 'Manager', instructor: 'Instructor', desk: 'Front desk', member: 'Member', automation: 'Automation', integration: 'Integration' };

// Assignments are a FUNCTION of the directory, not an authored document.
//
// `NiscApp.assignments` is a manifest field today, and for a platform holding
// hundreds of studios it cannot stay one — every person is an assignment, and
// people arrive at the speed of sign-ups rather than the speed of releases.
// Deriving them here keeps the shape honest while making the pressure visible:
// this is the first thing that moves to rows when the artifact layer lands.
const assignmentsFrom = (directory: Directory): Record<string, readonly string[]> => {
  const assignments: Record<string, readonly string[]> = {};
  for (const person of directory.everyone()) assignments[person.id] = directory.rolesOf(person);
  return assignments;
};

export const buildLyra = (directory: Directory, deps: ServerDeps): NiscApp => {
  const assignments = assignmentsFrom(directory);
  const app: NiscApp = defineApp({
    charter: CHARTER,
    assignments,
    actions: CATALOG_DEFINITIONS,

    // The prewarmed API surface — every read the app serves, seeded into the
    // cache at boot, protected and replay-only. `behaviors` compiles into each
    // principal's ScopePolicy; `resources` names which tables travel together.
    entries: [...ENTRIES, ...MUTATION_ENTRIES],
    behaviors: scopeBehaviors,
    resources: RESOURCES,

    // What a principal IS beyond its id. moss always injects `{ userId }`; this
    // adds `studioId`, and that single value is what makes the tenant behaviors
    // enforce a real boundary. The mapping is application knowledge, which is
    // exactly why moss asks for it rather than assuming a shape.
    // A grant from `ext.*` is deployment-wide; an installation is not. Moss
    // drops every integration action outside this list.
    installedIntegrations: (principal) => directory.installedFor(principal),
    // Who an integration IS when its key acts and nobody is driving. The
    // directory answers (an actor exists exactly as long as the install does);
    // what lands here is the assignment, because assignments are a function of
    // the directory (see `assignmentsFrom`) and an actor that appeared when a
    // studio installed mid-process registers itself the same way, at first use.
    integrationActor: (integration, actsFor) => {
      const actor = directory.integrationActor(integration, actsFor);
      if (actor !== null && app.assignments[actor] === undefined) {
        (app.assignments as Record<string, readonly string[]>)[actor] = ['integration'];
      }
      return actor;
    },

    // WHERE INTEGRATIONS MAY APPEAR — lyra's half of the placement contract.
    //
    // The member detail offers a seat: a rider gets the membership on screen
    // and the person's name, and the detail's own trigger is what binds them
    // at push time (people.layouts.ts). Two hubs accept placed screens — the
    // desk's People and the member's own area. Nothing else is on offer, so a
    // bundle claiming anywhere else is refused at intake with a sentence.
    // Offered key → where it lives on the host's data. The keys are the
    // contract; the paths are ours, read by the strip derivation and mirrored
    // by the detail's push trigger.
    attachable: { 'people.detail': { membership_id: 'membershipId', person_name: 'member.person_name' } },
    menuSlots: ['hub.people', 'hub.me'],
    scope: (principal) => {
      const studioId = directory.person(principal)?.studioId ?? '';
      // TODAY IS SCOPE, exactly like the studio. See users.ts for why: it is
      // the studio's clock, it is engine-injected, and it cannot be forged or
      // forgotten. Entries that mean "today" filter on it directly and take no
      // date from the caller at all.
      // BOTH ENDS OF THE WINDOW, or neither. The lower bound came from scope
      // and the upper was computed by the caller from a different clock, so a
      // fortnight query could be a day long or short at the far end — half a
      // fix, which is the kind that survives review and fails in production.
      // `membershipId` is what lets a row rule say "their own booking". It is
      // NULL for staff who do not train, and that is correct: the rule that
      // uses it only exists on the member rung.
      return {
        studioId,
        membershipId: directory.person(principal)?.membershipId ?? '',
        today: directory.todayFor(studioId),
        horizon: directory.horizonFor(studioId),
      };
    },

    // The `fn:` seam, server-side: endpoints an action can call, built once per
    // session so handlers close over the shell and the session's own wire.
    // Only auth lives here — everything else the app does is a vex entry, and a
    // function that could have been a query is a discipline break.
    functions: (session) => ({ ...authFunctions(session), ...memberFunctions(session), ...staffIntakeFunctions(session), ...staffFunctions(session, { pool: deps.pool, app, server: deps.server }), ...automationFunctions(session, { tide: deps.tide, pool: deps.pool }), ...navFunctions(session, { app, directory, pool: deps.pool, server: deps.server }), ...courseFunctions(session) }),

    shell: {
      // Every canvas names an explicit `actionLayout` with an `ActionSlot`, and
      // that is not decoration. The slot marker survives flattening and carries
      // the instance id, which is what a terminal stamps as an event's `origin`
      // — and nova delivers an event only to the instance the origin names.
      //
      // Left to the default top-of-stack render there is no marker, so a click
      // in a browser sends an origin that matches nothing and the whole
      // application is silently inert. Headless checks do not catch it: they
      // call `shell.dispatch` directly and never travel the wire.
      canvases: [
        // A CANDIDATE list: the first id the principal actually holds mounts.
        // Staff boot the staff bar, members the member bar, anonymous holds
        // neither and gets no chrome at all — nothing branches, and an
        // ungranted candidate simply is not there.
        {
          id: 'chrome',
          initial: ['chrome.staff', 'chrome.member'],
          actionLayout: { if: '$.active', then: { component: 'ActionSlot', props: { instanceId: '$.active.id' } }, else: '' },
        },
        {
          id: 'main',
          // A CANDIDATE list, in privilege order: the first landing surface the
          // principal actually holds mounts. An owner gets the overview, the
          // desk gets theirs, an instructor and a member get the day. Nobody
          // chooses, nothing branches, and an ungranted candidate is simply
          // absent — which is why an instructor's shell never even issues the
          // revenue request.
          initial: ['home.overview', 'home.desk', 'home.classes', 'home.member', 'auth.login'],
          actionLayout: {
            if: '$.active',
            then: { component: 'Box', props: { grow: true, h: '100%' }, children: [{ component: 'ActionSlot', props: { instanceId: '$.active.id' } }] },
            else: '',
          },
        },
        {
          // THE SHEET. Empty until something is pushed here, and an empty
          // canvas renders nothing — so the cost of having it is zero on every
          // screen that does not use it.
          id: 'sheet',
          initial: [],
          actionLayout: {
            if: '$.active',
            // `$.count` and `$.active.title` come from the canvas scope, so the sheet
            // knows how deep the stack is without any action telling it — which is
            // what lets the affordance be a Back rather than a Close when there is
            // something underneath.
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

      // THE SHEET RULE, as an artifact rather than a habit.
      //
      // Composed into anything pushed with `with: ['sheet']`: it supplies the
      // escape every overlay must have, so no action can land here and strand
      // somebody. See shell/sheet.fragment.ts.
      fragments: { sheet: sheetFragment },

      // Per-principal boot input — the app's one derivation hook. A principal
      // becomes a studio, a name, a role and a palette here, once, on the
      // server. Everything downstream reads those from action data, and a
      // terminal has no way to author them.
      inputs: ({ principal, actions: granted }): Record<string, Record<string, unknown>> => {
        const person = directory.person(principal);

        // Which landing surface THIS principal has, resolved from ring 1 — the
        // same candidate order the canvas uses. The nav bar needs it because
        // `resetTo` names an action, and the action differs per role; a layout
        // that chose between three ids would be a layout branching on
        // capability, which is the thing rule 11 forbids.
        //
        // Derived on the server from what the charter already resolved, so it
        // is not a second source of truth — it is the same one, read.
        const homeId = ['home.overview', 'home.desk', 'home.classes', 'home.member'].find((id) => granted.includes(id)) ?? '';

        // The nav, as rows — filtered to what this principal actually holds.
        //
        // It has to be data. A hand-authored bar offered an instructor a
        // "Members" button they do not hold, which mounted nothing and looked
        // broken; and a layout that hid it would be a layout branching on
        // capability (rule 11). Deriving it here from the resolved catalog is
        // ring 1 doing the work, and a nav item that exists is one that leads
        // somewhere by construction.
        //
        // `resetTo` resolves its `action`, so one ref serves every item and the
        // payload carries the target — which is what makes a looped nav
        // possible at all.
        const trains = person !== undefined && person.membershipId !== null;
        const MEMBER_ONLY = new Set(['hub.me']);

        // ── THE MENU: SIX AREAS, AND IT STOPS THERE ─────────────
        //
        // Read `nav/sections.ts` for why these six. What matters here is that
        // this list does not grow when features do: a new screen joins an AREA,
        // and its siblings become the tab row above it. The flat menu this
        // replaced gained an entry per feature and was already twelve long.
        //
        // Home is not an area — it is where you land and its action differs per
        // rung, so it comes from `homeId` and appears in no table.
        // What a studio bought never adds a menu entry: a pack's screens are
        // PLACED into these areas by its bundle, folded in by `nav.context`.
        //
        // AN AREA POINTS AT ITS FIRST SCREEN, not at a page about itself.
        //
        // `action` used to be the hub id and the hub was a screen listing
        // links — a tap that taught nothing. There is no hub now: tapping
        // People opens the roll, and the roll's siblings are the tab row above
        // it. `landingFor` picks the first screen the principal actually
        // holds, so an instructor and an owner can share an area and land
        // somewhere different inside it without anything branching.
        const offered = areasFor(granted).filter((area) => trains || !MEMBER_ONLY.has(area.id));
        const areas = offered.map((area) => ({ action: landingFor(area), areaId: area.id, label: area.label, icon: area.icon ?? '' }));

        // WHAT A THUMB CAN REACH. Five is the ceiling on a phone and the fifth
        // slot is More, so four destinations — the ones this rung wants most,
        // in the order the day runs. Everything else is still one tap away
        // behind More, which opens the same drawer the desktop rail is.
        //
        // HOME TAKES THE FIRST SLOT. It is the only destination everybody has
        // and the one people return to between tasks; leaving it behind More
        // would put the most-tapped screen two taps deep. It lights by its own
        // action, because it is its own area of one.
        const home = { action: homeId, areaId: homeId, label: 'Today', icon: 'home' };
        const primaryAreas = [home, ...areas].slice(0, 4);


        // Anonymous: the login page needs the cast to offer. Nothing else is
        // seeded, because nothing else exists for this principal.
        if (person === undefined) {
          return {
            main: {
              // The automation and integration principals are NOT offered.
              //
              // They are people as far as the directory is concerned — that is
              // what puts them under the charter — and automations turned up on
              // the demo sign-in list labelled "Member", which is wrong twice:
              // an automation is not a member, and nobody should be able to
              // sign in as one. A principal that never logs in should not be on
              // the one screen whose whole job is logging in — and an
              // integration's actor never logs in either; it presents a key.
              people: directory
                .everyone()
                .filter((p) => p.audience !== 'automation' && p.audience !== 'integration')
                .map((p) => ({ id: p.id, name: p.name, email: p.email, studio: p.studioName, role: ROLE_LABEL[p.audience] ?? 'Member' })),
            },
          };
        }

        const theme = directory.themeFor(person.studioId);
        const hour = new Date().getHours();
        const greeting = `Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, ${person.name.split(' ')[0] ?? person.name}`;

        return {
          chrome: {
            studioName: person.studioName,
            personName: person.name,
            roleLabel: ROLE_LABEL[person.audience] ?? 'Member',
            homeId,
            // Home is not in a group; it is where you land.
            home,
            areas,
            primaryAreas,
            // WHERE YOU ARE at boot, seeded so the first paint is already
            // right. `nav.context` confirms it on mount and owns it after —
            // this is the opening value, not a second source of truth.
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
