import { defineApp } from '@niscorp/moss';
import type { NiscApp } from '@niscorp/moss';
import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { CHARTER, ASSIGNMENTS } from './charter';
import { CATALOG_DEFINITIONS } from '@atrium/app/action-catalog';
import { ENTRIES, MUTATION_ENTRIES } from '@atrium/app/vex';
import { scopeBehaviors } from '@atrium/app/vex/behaviors';
import { RESOURCES } from '@atrium/app/vex/resources';
import { frameLayout } from '@atrium/app/shell/frame.layout';
import { sheetFragment } from '@atrium/app/shell/fragments/sheet.fragment';
import { detailFragment } from '@atrium/app/shell/fragments/detail.fragment';
import { landedFragment } from '@atrium/app/shell/fragments/landed.fragment';
import { authFunctions } from '@atrium/server/functions/auth';
import { connectorFunctions } from '@atrium/server/functions/connector';
import { assistantFunctions, attachAssistant } from '@atrium/server/assistant';
import { recordRun } from '@atrium/server/assistant/runs';
import { registerShellSession } from '@atrium/server/operator';
import { userById, people, SIBLINGS } from '@atrium/server/users';

// ═══════════════════════════════════════════════════════════
// Atrium, the application, as data.
//
// Everything here is an authored artifact — the policy document, who wears
// what, the action definitions, the resource subgraphs, the shell's canvases.
// The server derives the rest from these plus a database, whose seeded
// vex_cache IS the API surface.
//
// The one thing this file derives is `shell.inputs`: turning a principal into a
// property, a stay and an audience. That derivation is why the browser never
// sends a property id — the shell runs on the server and already knows.
// ═══════════════════════════════════════════════════════════

// ─── the small derivations `inputs` reads ────────────────────
// Presentation config only — which nav item lights up per audience, which glyph
// describes a person on the login page. Facts about a principal (name,
// property, accent, stay) come from the DIRECTORY, loaded from the database at
// boot; nothing here duplicates a row.

const ICONS: Record<string, string> = {
  guest: 'bed',
  desk: 'flag',
  service: 'wrench',
  ops: 'chart',
  vendor: 'plug',
};

// The manifest is a FUNCTION of the bundles because those come from ROWS:
// boot reads bundle_actions and bundle_entries back from the database (the
// discovery sync put them there) and hands both in. The app itself carries no
// integration — everything ext.* arrived over the wire.
export const buildAtrium = (bundleActions: Record<string, ActionDefinition>, bundleEntries: readonly (SeedEntry | SeedMutation)[]): NiscApp => {
  // ONE record, shared by reference with the running server: boot's refresh
  // mutates it in place after a sync, and the seeds hook below reads it — so
  // a guest logging in right after a go-live seeds the actions that just
  // landed, even though this function ran before they existed.
  const actions: Record<string, ActionDefinition> = { ...CATALOG_DEFINITIONS, ...bundleActions };

  return defineApp({
    charter: CHARTER,
    assignments: ASSIGNMENTS,
    actions,
    entries: [...ENTRIES, ...MUTATION_ENTRIES, ...bundleEntries],
    behaviors: scopeBehaviors,
    resources: RESOURCES,

    // What a principal IS beyond its id. moss always injects `{ userId }`; this
    // adds `propertyId` from the directory, and that is what makes the tenant
    // `match` behaviors in vex/behaviors.ts enforce a real boundary. The mapping
    // is application knowledge, which is exactly why moss asks the app for it
    // rather than assuming a shape.
    scope: (principal) => ({ propertyId: userById(principal)?.propertyId ?? '' }),

    // The `fn:` escape hatch, server-side: endpoints an action can call, built
    // once per session so handlers close over the shell and policy.
    functions: (session) => ({
      ...authFunctions(session),
      ...connectorFunctions(session),
      ...assistantFunctions(session),
    }),

    // Per living shell, for what is NOT an endpoint: the operator seam's roster,
    // and the assistant watching the screen. Nothing calls either — the
    // watcher's whole point is that attention belongs to the agent, not to
    // whoever authored a surface.
    //
    // Neither touches `session.shell` here: that getter throws until the build
    // finishes, and this runs mid-build.
    onSession: (session) => {
      registerShellSession(session);
      attachAssistant(session);
    },

    // Where a model run lands: one row per run — what was said, what was called,
    // what it cost — through the caller's own wire, so it is pinned to whoever
    // the run was for.
    runs: recordRun,

    shell: {
      // Three canvases for every audience. Which action mounts on `main` is a
      // CANDIDATE list: the first id the principal actually holds wins, so a
      // guest boots the concierge, a clerk the board, the vendor the console, and
      // anonymous the login. Nothing branches — an ungranted candidate simply is
      // not there.
      canvases: [
        { id: 'chrome', initial: ['chrome.guest', 'chrome.staff'] },
        {
          // FURNITURE only: the guest's concierge (greeting, unread, the
          // standing offer to write to the desk) and the login page. Every
          // WORKING surface — guest, crew and vendor alike — is composed onto
          // `home` below, which is what removed the nav bar.
          id: 'main',
          initial: ['concierge', 'auth.login'],
        },
        // The composed HOME: a list of LIVE action instances at preview level —
        // seeded per principal (see `seeds` below) from the resolved surface,
        // grown or re-aimed by the agent mid-conversation. Nobody hand-draws a
        // launcher; the actions render themselves, collapsed, each showing one
        // live line, and expand in place when tapped.
        //
        // GUESTS and CREW both, from the same read: what differs is the
        // audience it is read for, which is the whole claim — one composition
        // mechanism, five applications.
        {
          id: 'home',
          mode: 'list',
          // The same bounded column the concierge furniture lives in — the list
          // continues the page, it does not bleed across it.
          actionLayout: {
            component: 'Box',
            props: { px: 18 },
            children: {
              component: 'Stack',
              props: { gap: 10, maxWidth: 620, py: 4 },
              children: [
                {
                  for: '$.instances',
                  as: 'card',
                  key: 'id',
                  do: { component: 'ActionSlot', props: { instanceId: '$.card.id' } },
                },
              ],
            },
          },
        },
        // The staff launcher's own strip: full width, left-aligned, one line.
        // Separate from `home` because `home` centres a 620px column for the
        // guest's phone surface, and navigation inheriting that reads as a
        // floating menu rather than as part of the page.
        // Bare — the frame's top bar supplies the padding. A Box of its own
        // here is what made it a floating slab.
        {
          id: 'nav',
          actionLayout: { if: '$.active', then: { component: 'ActionSlot', props: { instanceId: '$.active.id' } }, else: '' },
        },
        // ── the crew's columns ──────────────────────────────
        // Each is a stack of its own; the frame arranges them. An action can
        // be SMALL again because it is no longer carrying a screen alone.
        {
          // The wide column a clerk lives in — a STACK, not a list.
          //
          // It was a list because the crew screen was a pile of collapsible
          // cards, and that is exactly what forced every surface to carry two
          // faces and a root branch. With the monoliths split, one thing is open
          // at a time: menu → list → detail → form, with Back real and `resume`
          // re-running mount, so a queue underneath a resolved issue re-reads
          // itself with nothing wired.
          //
          // The list canvas is the ASIDE, where many cards genuinely coexist.
          // A CLERK LANDS ON THEIR QUEUE — opened by the MENU, not by an
          // `initial` candidate list here. A list in the manifest would name the
          // landing surface in a second place, and the bar could then never mark
          // it active without the same names authored twice. The menu opens its
          // own first resolved entry, so there is one source of truth: the rows.
          id: 'work',
          actionLayout: {
            if: '$.active',
            then: {
              component: 'Box',
              props: { px: 20, py: 18 },
              children: [{ component: 'ActionSlot', props: { instanceId: '$.active.id' } }],
            },
            else: '',
          },
        },
        // THE RECORD COLUMN. A list stays in `work`; the one thing being worked
        // opens HERE, beside it. A row `resetTo`s this canvas — so picking a
        // second row replaces the record rather than stacking one behind it —
        // and a form `push`es on top of the record it is about, so Back returns
        // to that record and never to an empty screen.
        {
          id: 'detail',
          actionLayout: {
            if: '$.active',
            then: {
              component: 'Box',
              props: { px: 20, py: 18, grow: true, scroll: true, h: '100%' },
              children: [{ component: 'ActionSlot', props: { instanceId: '$.active.id' } }],
            },
            else: '',
          },
        },
        // NO third column. A rail of two squeezed cards beside a work column
        // and a workspace was three columns competing for one screen; the
        // things that were on it (arrivals, the call sheet, rooms) are things
        // a clerk actually works in, so they belong in `work`. The canvas is
        // gone rather than left empty — an unused concept is worse than a
        // missing one.
        { id: 'sheet' },
        // THE ASSISTANT'S COLUMN — and now it is only the assistant's.
        //
        // It used to have two writers: `desk.openGuest` composed every
        // stay-scoped desk surface into it the moment a guest came into context,
        // and the model added to that list. Reading it back, the composition was
        // the whole problem. It fired from two hardcoded triggers (an arrivals
        // row, a message thread), which is the same authored-attention mistake
        // the watcher exists to remove. And because the push tool refuses
        // anything already on screen, a full column left the model nothing it
        // was permitted to add in the one situation that matters most — a clerk
        // working a guest. Its only legal move became reordering cards the app
        // had chosen. So the column looked identical whether or not there was a
        // model behind it, because it was.
        //
        // A guest is one record and opens as one surface on `work`, from a row
        // click, like every other record. What belongs BESIDE it is a judgement
        // per situation, and this column is where that judgement goes.
        //
        // The test worth keeping: nothing but the agent writes here, so an empty
        // aside means the agent has offered nothing. Reached asked (the dock) or
        // unasked (server/assistant/watch); the column does not say
        // which, because a clerk cares whether a card is useful, not who thought
        // of it. The bounds that make "push anything helpful" safe live on the
        // push tool: never a second copy of what is on screen, never a duplicate
        // inside the column.
        //
        // The PANEL is here: the region belongs to the canvas and the card to
        // the action. There is no `aside` fragment — it drew no chrome and
        // answered a close ref nothing fired, both left over from the
        // collapsible card that used to sit here. Guarded on `$.instances` so
        // an empty column is no column at all rather than an empty one.
        {
          id: 'aside',
          mode: 'list',
          actionLayout: {
            if: '$.instances.length',
            then: {
              component: 'Aside',
              props: {},
              children: {
                component: 'Stack',
                props: { gap: 14, pad: 16 },
                children: [
                  {
                    for: '$.instances',
                    as: 'card',
                    key: 'id',
                    do: { component: 'ActionSlot', props: { instanceId: '$.card.id' } },
                  },
                ],
              },
            },
            else: '',
          },
        },
        // The agent's window — every authenticated principal carries it;
        // anonymous holds no `assistant`, so nothing mounts.
        { id: 'assistant', initial: 'assistant' },
      ],
      layout: frameLayout,
      fragments: { sheet: sheetFragment, detail: detailFragment, landed: landedFragment },

      // Per-principal HOME seeding — the instance twin of `inputs`, and the
      // ONE composition mechanism behind every audience's application.
      //
      // It reads the resolved surface for the caller's audience and seeds a
      // collapsed instance of every action that can render itself small.
      // "Can render itself small" is not a list anyone keeps: it is `expanded`
      // appearing in the action's declared input, so an integration that ships
      // a preview-capable surface joins the home the moment its rows land.
      //
      //   guests — their stay's surface, stay-state filtered engine-side
      //   crew   — their house's surface; the stay-scoped ones are held back
      //            for the guest workspace (see `desk.openGuest`), because a
      //            "book the spa for…" card with nobody chosen is furniture,
      //            not work
      //   vendor — not slot-resolved at all (the estate console is granted
      //            outright, not placed per property), so RING 1 is its
      //            resolution: the preview-capable ids it holds. The same
      //            split the agent's own action list makes.
      seeds: async ({ principal, actions: granted, wire }) => {
        const user = userById(principal);
        if (user === undefined) return { home: [] };
        const read = async (fingerprint: string, context: Record<string, unknown>): Promise<unknown> => {
          const res = await wire('/api/vex', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ fingerprint, context }),
          });
          return res.ok ? res.json() : null;
        };
        const propsOf = (id: string): Record<string, unknown> => {
          const input = actions[id]?.input;
          return (input as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
        };

        // The vendor: ring 1 IS the surface. No property, no slots, no stay —
        // the estate console is granted outright, so the composition is the
        // preview-capable ids it holds, in catalog order.
        if (user.audience === 'vendor') {
          return {
            home: granted.filter((id) => 'expanded' in propsOf(id)).map((id) => ({ action: id, input: { expanded: false } })),
          };
        }

        // A guest's stay decides which of their slots apply; crew read the
        // house, where stay state is not a factor.
        const stay =
          user.audience === 'guest' ? ((await read('stay/current', { guestId: user.id })) as { state?: string } | null) : null;
        const rows = (await read('surface/live', {
          propertyId: user.propertyId,
          audience: user.audience,
          stayState: String(stay?.state ?? 'any'),
        })) as { action_id?: string; title?: string; icon?: string; capability_id?: string; canvas?: string }[] | null;

        // FAN OUT by the slot's canvas. `seeds` was always keyed by canvas id;
        // piling everything onto one was the mistake that made a crew screen a
        // phone screen on a monitor. The row says which stack it belongs on and
        // the frame arranges the stacks.
        //
        // `aside` is skipped here on purpose: those are stay-scoped and belong
        // to a GUEST, so they arrive when one is opened (`desk.openGuest`), not
        // at login with nobody chosen.
        // WHAT IS COMPOSED is decided by the slot's canvas alone. `home` holds
        // the guest's own surfaces; `work` is a stack nothing is seeded onto —
        // a clerk opens it from the menu — and `detail` marks the surfaces that
        // are only ever pushed, by their parent or by the assistant.
        const byCanvas: Record<string, { action: string; input: Record<string, unknown> }[]> = { home: [], nav: [] };
        // The staff launcher, on its own strip: the way into everything the
        // working column can hold, composed rather than authored because it
        // reads the same resolved rows.
        if (user.audience !== 'guest') {
          byCanvas['nav']?.push({ action: 'staff.menu', input: { propertyId: user.propertyId, staffId: user.staffId ?? '', audience: user.audience } });
        }
        // One instance per ACTION: a surface serving two capabilities holds two
        // slots (Approvals — upgrades and late checkout) and must card once.
        const seen = new Set<string>();
        for (const row of Array.isArray(rows) ? rows : []) {
          const id = String(row.action_id ?? '');
          const declared = propsOf(id);
          if (seen.has(id)) continue;
          const canvas = String(row.canvas ?? 'work');
          const target = byCanvas[canvas];
          if (target === undefined) continue;
          // `home` is still the LIST of collapsed cards the guest surface is
          // built from, so it takes only actions that can render themselves
          // small — `expanded` in the input contract, as before.
          if (canvas === 'home' && !('expanded' in declared)) continue;
          seen.add(id);
          target.push({
            action: id,
            // Exactly the keys this action declares, and no others — the same
            // rule-14 filter an opener obeys. `sheetTitle` is deliberately
            // absent: its absence is what tells the action it is on a canvas
            // rather than an overlay, which is what gives it its collapse.
            // Generic forms additionally wear their SLOT's title and icon.
            input: {
              ...('stayId' in declared ? { stayId: user.stayId ?? '' } : {}),
              ...('propertyId' in declared ? { propertyId: user.propertyId } : {}),
              ...('staffId' in declared ? { staffId: user.staffId ?? '' } : {}),
              ...('capability' in declared ? { capability: String(row.capability_id ?? '') } : {}),
              // Only where the action still HAS a collapse level. A migrated
              // tile has no second face to fold into, and handing it one would
              // put back the very key the split removed.
              ...('expanded' in declared ? { expanded: false } : {}),
              ...('cardTitle' in declared ? { cardTitle: String(row.title ?? '') } : {}),
              ...('cardIcon' in declared ? { cardIcon: String(row.icon ?? 'dot') } : {}),
            },
          });
        }
        return byCanvas;
      },

      // Per-principal boot input — the app's one derivation hook. A principal
      // becomes a property, a stay, a staff id and an audience here, once, on the
      // server. Everything downstream reads those from action data, and a
      // terminal has no way to author them.
      inputs: ({ principal }): Record<string, Record<string, unknown>> => {
        const user = userById(principal);

        // Anonymous: the login page needs the directory to describe the roles it
        // is offering. Nothing else is seeded, because nothing else exists.
        if (user === undefined) {
          return {
            main: {
              people: people().map((p) => ({
                id: p.id,
                username: p.username,
                name: p.name,
                blurb: p.blurb,
                icon: ICONS[p.audience] ?? 'dot',
              })),
            },
          };
        }

        // What the boot action on `main` is seeded with — exactly the keys its
        // audience's actions declare. A guest's world is a stay; staff's is a
        // property and their own hands; the vendor's is the estate (nothing).
        const common = user.audience === 'guest' ? { propertyId: user.propertyId, stayId: user.stayId ?? '' } : user.audience === 'vendor' ? {} : { propertyId: user.propertyId, staffId: user.staffId ?? '' };

        // Each chrome gets exactly the keys its definition declares — the guest
        // chrome knows nothing of staff ids, the staff chrome nothing of guests.
        const chrome =
          user.audience === 'guest'
            ? { propertyName: user.propertyName, accent: user.accent, guestName: user.name }
            : {
                propertyId: user.propertyId,
                staffId: user.staffId ?? '',
                propertyName: user.propertyName,
                accent: user.accent,
                staffName: user.name,
                job: user.job ?? '',
                // NO nav flags. There used to be eleven booleans here, one per
                // authored nav edge, and they could only ever name surfaces
                // that existed when this file was written — which is why the
                // crew screen never learned anything from a go-live. The
                // working surface is composed in `seeds` from resolved rows
                // instead, and the chrome is just chrome.
                audience: user.audience,
                // One human, two houses: the sibling principal's property, if
                // one exists. Derived from the directory at session build — the
                // switch itself is a server-side re-grant.
                sibling: ((): Record<string, unknown> => {
                  const sib = userById(SIBLINGS[user.id] ?? null);
                  return sib === undefined ? {} : { propertyName: sib.propertyName };
                })(),
              };

        // `work` gets the same session keys: whichever queue mounts there by
        // default needs the property it belongs to, and a terminal has no way to
        // author one.
        return { chrome, main: common };
      },
    },
  });
};
