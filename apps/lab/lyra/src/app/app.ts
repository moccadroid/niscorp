import { defineApp } from '@niscorp/moss';
import type { NiscApp } from '@niscorp/moss';
import { createIntegrations } from '@niscorp/moss/integrations';
import { integrationExtension } from './integration-extension';
import { createTideFacts } from '@niscorp/moss/tide';
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

const EMPTY_BOOK: Phrasebook = Object.freeze({});

export type ServerDeps = {
  pool: import('@niscorp/vex').PgPool;
  server: () => import('@niscorp/moss').MossServer;
  tide: () => import('@niscorp/tide').Tide;
  driver: () => import('@niscorp/tide').TideDriver;
  reloadAutomations: () => Promise<number>;
  signingSeed?: string;
};

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', manager: 'Manager', instructor: 'Instructor', desk: 'Front desk', member: 'Member', automation: 'Automation', integration: 'Integration' };

type Wire = import('@niscorp/nova').FetchFn;

export const readEntry = async (wire: Wire, fingerprint: string, context: Record<string, unknown>): Promise<unknown> => {
  const response = await wire('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint, context }) });
  if (!response.ok) return undefined;
  return response.json();
};

// The app's own rows are folded over these, so an integration cannot rename a
// word the host owns.
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
  return Object.freeze(book);
};

// One book per language for every tenant: `phrases` is owned by no tenant, and
// `phrases/integrations` filters on approval, not on who installed what. Only
// the seed writes `phrases`: a runtime write path needs a reaction on it here.
const FOLDED: Record<string, { key: string; book: Promise<Phrasebook> }> = {};

export const bookOverWire = async (wire: Wire, language: string): Promise<Phrasebook> => {
  if (language === '' || language === 'en') return EMPTY_BOOK;
  const words = integrationWords(await readEntry(wire, 'phrases/integrations', { locale: language }));
  const key = JSON.stringify(words);
  const held = FOLDED[language];
  const folding = held !== undefined && held.key === key ? held.book : foldOverWire(wire, language, words);
  FOLDED[language] = { key, book: folding };
  try {
    return await folding;
  } catch (err) {
    if (FOLDED[language]?.book === folding) delete FOLDED[language];
    throw err;
  }
};

export const forgetBooks = (): void => {
  for (const language of Object.keys(FOLDED)) delete FOLDED[language];
};

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

// An integration with a charter rung of its own acts on it; every other one
// shares `integration`, so widening that rung for one widens it for all.
const integrationRung = (actorId: string): string | undefined => {
  if (!actorId.startsWith('ig_')) return undefined;
  const integration = actorId.slice('ig_'.length).split('@')[0] ?? '';
  return integration !== '' && CHARTER[integration] !== undefined ? integration : 'integration';
};

// Pairs only: the boot check iterates each single role itself. A staff role
// gains `member` when the studio also knows the person; `automation` does not.
const DUAL = ['owner', 'manager', 'instructor', 'desk'] as const;
const WEARABLE: readonly (readonly string[])[] = DUAL.map((role) => [role, 'member']);

const ATTACHABLE = { 'people.detail': { person_id: 'personId', person_name: 'member.person_name' } };

export const buildLyra = (deps: ServerDeps): NiscApp => {
  const integrations = createIntegrations({
    integrationActor: (integration, actsFor) => (integration === '' || actsFor === '' ? null : `ig_${integration}@${actsFor}`),
    extension: integrationExtension({
      attachable: ATTACHABLE,
      menuSlots: ['hub.people', 'hub.me', 'hub.money'],
      names: { ...Object.fromEntries(AREAS.map((area) => [area.id, area.label])), 'people.detail': 'a member’s record' },
    }),
    ...(deps.signingSeed === undefined ? {} : { signingSeed: deps.signingSeed }),
  });

  // A fact is stamped with the `automationActor` of the write's own scope, so
  // it wakes that studio's automations and nobody else's.
  const tideFacts = createTideFacts({
    // The driver, not bare tide: a minted fact wakes the engine. A write during
    // boot lands before the driver exists and mints no fact.
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
    // Chain headers are trusted only on a write made by the studio's own
    // automation principal: a forged depth could park an innocent chain.
    chain: (scope, hints) => (String(scope['userId'] ?? '') === String(scope['automationActor'] ?? '\u0000') ? hints : undefined),
  });

  const app: NiscApp = defineApp({
    charter: CHARTER,
    wearable: WEARABLE,
    actions: CATALOG_DEFINITIONS,

    entries: [...ENTRIES, ...MUTATION_ENTRIES],
    behaviors: scopeBehaviors,
    resources: RESOURCES,

    features: [integrations, tideFacts],
    identity: {
      as: 'identity',
      resolve: (principal, read) => identityFor(deps.pool, principal, integrationRung, read),
    },
    // Asked per request, not held on the session's identity record: a session
    // opened at 23:58 would go on telling every read it is yesterday.
    scope: (_principal, identity) => clockScope(String(identity?.scope['timezone'] ?? '')),

    phrases: async ({ principal, identity, wire }) => {
      if (principal === null) return undefined;
      const book = await bookOverWire(wire, String(identity['locale'] ?? ''));
      return Object.keys(book).length === 0 ? undefined : book;
    },
    phraseKeys: PHRASE_KEYS,

    reactions: [
      // Pushed only to the rungs that hold the Notices screen: a member's shell
      // has no bell, and an instructor's rung cannot read the table.
      {
        table: 'notifications',
        op: 'insert',
        run: ({ scope }, { deliver }) => {
          const studioId = String(scope['studioId'] ?? '');
          if (studioId === '') return;
          void (async () => {
            const HEARS = new Set(['owner', 'manager', 'desk']);
            for (const live of deps.server().shells?.list() ?? []) {
              const record = await deps.server().identity(live.principal);
              if (String(record.scope['studioId'] ?? '') !== studioId) continue;
              if (!record.roles.some((role) => HEARS.has(role))) continue;
              deliver(live.principal, 'notified');
            }
          })().catch((err: unknown) => console.error('[lyra:notify]', err));
        },
      },
      {
        table: 'studio_integrations',
        run: ({ scope }) => {
          const studioId = String(scope['studioId'] ?? '');
          if (studioId !== '') deps.server().invalidateTag(studioId);
          // An integration's actions are deployment-wide: they need a full refresh.
          deps.server().refresh();
        },
      },
      {
        table: 'automations',
        run: () => {
          void deps.reloadAutomations().catch((err: unknown) => console.error('[lyra:automations]', err));
        },
      },
    ],

    functions: (session) => ({ ...authFunctions(session, { runAs: (role, fingerprint, context, scope) => deps.server().executeAs(role, fingerprint, context, scope), now: () => Date.now(), base: () => process.env['LYRA_BASE'] ?? 'http://localhost:5180' }), ...worldFunctions(session, { app, server: deps.server }), ...automationFunctions(session, { tide: deps.tide, driver: deps.driver, server: deps.server }), ...navFunctions(session, { server: deps.server, integrations, attachable: ATTACHABLE }), ...mailFunctions(session) }),

    shell: {
      // Every canvas needs an `actionLayout` with an `ActionSlot`: it carries the
      // instance id a terminal stamps as an event's `origin`, and without it a
      // browser click matches nothing. Headless checks do not catch its absence.
      canvases: [
        // `initial` is a candidate list: the first id the principal holds mounts.
        {
          id: 'chrome',
          initial: ['chrome.staff', 'chrome.member'],
          actionLayout: { if: '$.active', then: { component: 'ActionSlot', props: { instanceId: '$.active.id' } }, else: '' },
        },
        {
          id: 'main',
          initial: ['home.overview', 'home.desk', 'home.classes', 'home.member', 'auth.login'],
          actionLayout: {
            if: '$.active',
            then: { component: 'Box', props: { grow: true, h: '100%' }, children: [{ component: 'ActionSlot', props: { instanceId: '$.active.id' } }] },
            else: '',
          },
        },
        {
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

      fragments: { sheet: sheetFragment },

      inputs: async ({ principal, actions: granted, identity, wire }): Promise<Record<string, Record<string, unknown>>> => {
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
          // Every name and email, to anybody who reaches the login screen:
          // `readDevLoginRoster` answers only when the dev-login flag is on.
          const people = await readDevLoginRoster((role, fingerprint, context, scope) => deps.server().executeAs(role, fingerprint, context, scope));
          return { main: { people: people.map((p) => ({ ...p, role: ROLE_LABEL[p.role] ?? 'Member' })) } };
        }

        const theme = await themeOverWire(wire);
        const book = await bookOverWire(wire, str('locale'));

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
            currentArea: homeId,
            currentLeaf: homeId,
            themeTokens: theme.tokens,
            themeName: theme.name,
          },
          main: { studioId, studioName: str('studioName'), personName: str('name'), greeting },
        };
      },
    },
  });

  return app;
};
