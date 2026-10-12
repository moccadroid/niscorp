import { defineApp } from '@niscorp/moss';
import type { NiscApp, NiscRuntime } from '@niscorp/moss';
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
import { definitionsNow } from '@atrium/server/assistant/knowledge';
import { recordRun } from '@atrium/server/assistant/runs';
import { registerShellSession } from '@atrium/server/operator';
import { userById, people, SIBLINGS } from '@atrium/server/users';
import { PAGES } from './pages';

const ICONS: Record<string, string> = {
  guest: 'bed',
  desk: 'flag',
  service: 'wrench',
  ops: 'chart',
  vendor: 'plug',
};

// The bundles' actions are not shipped here. They change while the app runs, so
// boot hands them to the server as a set of their own
// (`server.replaceActions('bundles', …)`) at start and after every sync; a copy
// shipped here would never leave.
export const buildAtrium = (bundleEntries: readonly (SeedEntry | SeedMutation)[], runtime: NiscRuntime): NiscApp => {
  return defineApp({
    charter: CHARTER,
    assignments: ASSIGNMENTS,
    actions: { ...CATALOG_DEFINITIONS },
    entries: [...ENTRIES, ...MUTATION_ENTRIES, ...bundleEntries],
    behaviors: scopeBehaviors,
    resources: RESOURCES,

    // moss always injects `{ userId }`. `propertyId` is what the tenant `match`
    // behaviors in vex/behaviors.ts compare against.
    scope: (principal) => ({ propertyId: userById(principal)?.propertyId ?? '' }),

    functions: (session) => ({
      ...authFunctions(session),
      ...connectorFunctions(session, runtime),
      ...assistantFunctions(session),
    }),

    // Neither touches `session.shell` here: that getter throws until the build
    // finishes, and this runs mid-build.
    onSession: (session) => {
      registerShellSession(session);
      attachAssistant(session);
    },

    runs: recordRun,

    pages: {
      ...PAGES,
      about: {
        ...PAGES['about'],
        path: '/about',
        canvases: PAGES['about']?.canvases ?? [],
        inputs: ({ principal }): Record<string, Record<string, unknown>> => {
          const user = userById(principal);
          return user === undefined ? {} : { who: { name: people().find((person) => person.id === user.id)?.name ?? user.id } };
        },
      },
    },

    shell: {
      canvases: [
        { id: 'chrome', initial: ['chrome.guest', 'chrome.staff'] },
        {
          id: 'main',
          initial: ['concierge', 'auth.login'],
        },
        {
          id: 'home',
          mode: 'list',
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
        {
          id: 'nav',
          actionLayout: { if: '$.active', then: { component: 'ActionSlot', props: { instanceId: '$.active.id' } }, else: '' },
        },
        {
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
        { id: 'sheet' },
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
        { id: 'assistant', initial: 'assistant' },
      ],
      layout: frameLayout,
      fragments: { sheet: sheetFragment, detail: detailFragment, landed: landedFragment },

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
        // Includes the synced bundles' actions, which land after this manifest
        // is built.
        const definitions = definitionsNow();
        const propsOf = (id: string): Record<string, unknown> => {
          const input = definitions[id]?.input;
          return (input as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
        };

        // The vendor has no property, so no slots resolve for it: its home is
        // the preview-capable ids it holds.
        if (user.audience === 'vendor') {
          return {
            home: granted.filter((id) => 'expanded' in propsOf(id)).map((id) => ({ action: id, input: { expanded: false } })),
          };
        }

        const stay =
          user.audience === 'guest' ? ((await read('stay/current', { guestId: user.id })) as { state?: string } | null) : null;
        const rows = (await read('surface/live', {
          propertyId: user.propertyId,
          audience: user.audience,
          stayState: String(stay?.state ?? 'any'),
        })) as { action_id?: string; title?: string; icon?: string; capability_id?: string; canvas?: string }[] | null;

        // Only `home` and `nav` are seeded: a clerk opens `work` from the menu,
        // and a `detail` surface is only ever pushed.
        const byCanvas: Record<string, { action: string; input: Record<string, unknown> }[]> = { home: [], nav: [] };
        if (user.audience !== 'guest') {
          byCanvas['nav']?.push({ action: 'staff.menu', input: { propertyId: user.propertyId, staffId: user.staffId ?? '', audience: user.audience } });
        }
        // One instance per action: a surface serving two capabilities holds two
        // slots.
        const seen = new Set<string>();
        for (const row of Array.isArray(rows) ? rows : []) {
          const id = String(row.action_id ?? '');
          const declared = propsOf(id);
          if (seen.has(id)) continue;
          const canvas = String(row.canvas ?? 'work');
          const target = byCanvas[canvas];
          if (target === undefined) continue;
          if (canvas === 'home' && !('expanded' in declared)) continue;
          seen.add(id);
          target.push({
            action: id,
            // `sheetTitle` is left out: its absence tells the action it is on a
            // canvas rather than an overlay, which gives it its collapse.
            input: {
              ...('stayId' in declared ? { stayId: user.stayId ?? '' } : {}),
              ...('propertyId' in declared ? { propertyId: user.propertyId } : {}),
              ...('staffId' in declared ? { staffId: user.staffId ?? '' } : {}),
              ...('capability' in declared ? { capability: String(row.capability_id ?? '') } : {}),
              ...('expanded' in declared ? { expanded: false } : {}),
              ...('cardTitle' in declared ? { cardTitle: String(row.title ?? '') } : {}),
              ...('cardIcon' in declared ? { cardIcon: String(row.icon ?? 'dot') } : {}),
            },
          });
        }
        return byCanvas;
      },

      inputs: ({ principal }): Record<string, Record<string, unknown>> => {
        const user = userById(principal);

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

        const common = user.audience === 'guest' ? { propertyId: user.propertyId, stayId: user.stayId ?? '' } : user.audience === 'vendor' ? {} : { propertyId: user.propertyId, staffId: user.staffId ?? '' };

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
                audience: user.audience,
                sibling: ((): Record<string, unknown> => {
                  const sib = userById(SIBLINGS[user.id] ?? null);
                  return sib === undefined ? {} : { propertyName: sib.propertyName };
                })(),
              };

        return { chrome, main: common };
      },
    },
  });
};
