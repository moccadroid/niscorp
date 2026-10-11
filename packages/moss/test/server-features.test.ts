import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { createPostgresCache, scopeGrants } from '@niscorp/vex';
import type { SeedEntry } from '@niscorp/vex';
import type { Charter } from '@niscorp/charter';
import { dataOver } from '../src/data/data';
import { featureTablesOf } from '../src/data/feature-tables';
import { createGrammarUpgrader } from '../src/data/grammar';
import type { Feature, FeatureSeams } from '../src/feature';
import { memoKey } from '../src/identity';
import { createRunningManifest } from '../src/manifest';
import type { RunningManifest } from '../src/manifest';
import { buildData } from '../src/server/data';
import { emptyRegister, startFeatures } from '../src/server/features';
import type { SeamParts } from '../src/server/features';
import type { Env } from '../src/server/moss-server';
import { engineDouble } from './data-double';

// THE FEATURES AS THE SERVER STARTS THEM (../src/server/features.ts), with no
// server and no database: the running manifest is the real one, the data
// module stands over an engine with nothing behind it (./data-double.ts), and
// who somebody is is a function written here.
//
// `Feature` and `FeatureSeams` are public, so anybody can write a feature.
// What one is handed decides what it can do, whatever it was written to do.

const charter: Charter = { public: ['home'] };

// The database the engine reads has two tables, `notes` and `tags`, and one
// row to answer any read with (./data-double.ts). `features` is what the app
// named: the data module is told which tables each one named as its own, as
// the server tells it.
const world = async (features: readonly Feature[] = []): Promise<{ parts: SeamParts; server: Hono<Env>; operator: Hono<Env>; running: RunningManifest; start: () => Promise<void> }> => {
  const double = await engineDouble();
  const grants = scopeGrants(['notes', 'tags']);
  const data = dataOver(
    { engine: double.engine, adapter: double.adapter, grants, grammars: await createGrammarUpgrader({}), upgradeStore: async () => undefined },
    { db: double.db, charter, featureTables: featureTablesOf({ features }) },
  );
  const running = createRunningManifest({ shipped: { charter, actions: { home: { id: 'home' } } }, grants });
  const server = new Hono<Env>();
  const operator = new Hono<Env>();
  const resolved = { roles: ['public'], scope: {}, installed: undefined, key: memoKey(['public'], undefined) };
  const parts: SeamParts = {
    app: { charter },
    runtime: {},
    server,
    operator,
    registered: emptyRegister(),
    identity: { resolve: async () => resolved, scopeValuesFor: async () => ({}) },
    running,
    data,
  };
  return { server, operator, parts, running, start: () => startFeatures(features, parts) };
};

// A feature that keeps what it was started with, and does nothing else.
const keeping = (name: string): { feature: Feature; seams: () => FeatureSeams } => {
  const kept: FeatureSeams[] = [];
  return {
    feature: {
      name,
      start: (seams) => {
        kept.push(seams);
      },
    },
    seams: () => {
      const [seams] = kept;
      if (seams === undefined) throw new Error(`the feature "${name}" was not started`);
      return seams;
    },
  };
};

describe('the features, as the server starts them', () => {
  it('each is started with seams of its own: what one is handed is not what the next is', async () => {
    const first = keeping('first');
    const second = keeping('second');
    const { start } = await world([first.feature, second.feature]);
    await start();
    expect(first.seams()).not.toBe(second.seams());
  });

  // The seed assertions are signed with was a member of the seams, so every
  // feature was handed the private half of that key. It is the integrations
  // feature's own setting now (`createIntegrations({ signingSeed })`).
  it('none is handed a signing seed', async () => {
    const probe = keeping('probe');
    const { start } = await world([probe.feature]);
    await start();
    expect(Object.keys(probe.seams())).not.toContain('signingSeed');
  });
});

// WHAT A FEATURE ASKS ABOUT SOMETHING SOMEBODY ELSE WROTE, before it lets it
// in. The integrations feature asked the manifest module itself, by importing
// two of its functions: a feature somebody else writes has the seams and
// nothing else, and could not ask. Both are seams.
describe('the features — what somebody else wrote', () => {
  // The app's kit: a component with a strict schema of its props, and one
  // with none.
  const kit = { Badge: { meta: { propsSchema: z.object({ tone: z.enum(['calm', 'loud']) }).strict() } }, Text: {} };
  const started = async (): Promise<FeatureSeams> => {
    const probe = keeping('probe');
    const { start, parts } = await world([probe.feature]);
    parts.app = { charter, shell: { canvases: [], components: kit } };
    await start();
    return probe.seams();
  };

  it('a layout is held to the app’s kit: a component it has none for, a prop the component has no place for, a value its schema refuses', async () => {
    const seams = await started();
    expect(seams.layoutMisfits({ component: 'Text', children: [{ component: 'Badge', props: { tone: 'calm' } }] })).toEqual([]);
    expect(
      seams.layoutMisfits({ component: 'Text', children: [{ component: 'Chart' }, { component: 'Badge', props: { tone: 'shrill', size: 2 } }, { component: 'Badge', props: { tone: '$.tone' } }] }),
    ).toEqual(['layout uses "Chart", which this app has no component for', expect.stringMatching(/^"Badge" prop "tone" — /), '"Badge" has no prop "size"']);
  });

  it('the chains of steps that never end among a set of actions are named, each with the actions it runs through', async () => {
    const seams = await started();
    const quiet: ActionDefinition = { id: 'quiet' };
    const loud: ActionDefinition = { id: 'loud', triggers: [{ message: 'again', do: [{ emit: { channel: 'again' } }] }] };
    expect(seams.endlessChains({ quiet })).toEqual([]);
    expect(seams.endlessChains({ quiet, loud })).toEqual([{ path: 'again —emit (loud)→ again', through: ['loud'] }]);
  });
});

// A CREDENTIAL IS REACHED BY ITS PREFIX. The door hands a token to the first
// credential whose prefix the token starts with, and to the session verifier
// when none does. So what a feature registers decides whose tokens it is
// handed, and a feature anybody writes registers one.
describe('the features — a credential of a feature’s own', () => {
  const nobody = async (): Promise<{ refused: { status: 401; error: string; message: string } }> => ({ refused: { status: 401, error: 'refused', message: 'No.' } });
  // A feature that registers each of these prefixes when it starts.
  const reading = (name: string, ...prefixes: string[]): Feature => ({
    name,
    start: (seams) => {
      for (const prefix of prefixes) seams.registerCredential(prefix, nobody);
    },
  });

  it('is registered under the prefix its tokens carry, one for each feature that has one', async () => {
    const { start, parts } = await world([reading('keys', 'ik_'), reading('hooks', 'wh_')]);
    await start();
    expect(parts.registered.credentials.map((credential) => [credential.feature, credential.prefix])).toEqual([
      ['keys', 'ik_'],
      ['hooks', 'wh_'],
    ]);
  });

  // Every token starts with nothing: the feature would be handed every token
  // there is, each person's session included, and decide who it is.
  it('an empty prefix refuses the boot', async () => {
    const { start, parts } = await world([reading('greedy', '')]);
    await expect(start()).rejects.toThrow(
      /^moss: the feature "greedy" registered a credential with an empty prefix\. A token is handed to the credential whose prefix it starts with, and every token starts with nothing: this one would be handed every token there is, each person's session included\./,
    );
    expect(parts.registered.credentials).toEqual([]);
  });

  // Which of two features reads a token would be whichever started first.
  it.each([
    ['the prefix another feature registered', 'ik_', 'ik_'],
    ['one that another feature’s prefix starts with', 'ik_', 'ik'],
    ['one that starts with another feature’s prefix', 'ik_', 'ik_live_'],
  ])('%s refuses the boot', async (_what, first, second) => {
    const { start, parts } = await world([reading('keys', first), reading('other', second)]);
    await expect(start()).rejects.toThrow(
      `moss: the feature "other" registered a credential for tokens that start with "${second}", and the feature "keys" reads the ones that start with "${first}". ` +
        'One is the start of the other, so which of the two a token is handed to would be decided by the order the features start in.',
    );
    expect(parts.registered.credentials.map((credential) => credential.prefix)).toEqual([first]);
  });

  it('a feature that registers one prefix twice is refused the same way', async () => {
    const { start } = await world([reading('keys', 'ik_', 'ik_')]);
    await expect(start()).rejects.toThrow(/the feature "keys" registered a credential for tokens that start with "ik_", and the feature "keys" reads the ones that start with "ik_"/);
  });

  // `st_` is what moss's own stored sessions start with (../src/identity).
  it.each(['st_', 's', 'st_live_'])('a prefix that overlaps the one moss’s stored sessions carry ("%s") refuses the boot', async (prefix) => {
    const { start } = await world([reading('greedy', prefix)]);
    await expect(start()).rejects.toThrow(
      `moss: the feature "greedy" registered a credential for tokens that start with "${prefix}", and the sessions moss keeps itself start with "st_". ` +
        "One is the start of the other, so in a deployment that keeps them (`session: 'sessions'`) a person's session would be handed to the feature.",
    );
  });
});

const TAGS: SeedEntry = { fingerprint: 'tagging/all', dsl: { from: ['tags'], fields: ['tags.id'], limit: 10 } };
const NOTES: SeedEntry = { fingerprint: 'probe/notes', dsl: { from: ['notes'], fields: ['notes.id', 'notes.body'], limit: 10 } };

// WHAT A REVIEWER RAN: a feature of its own, booted beside the app, that
// handed `ownEntries` a read of a table with the table's name beside it. The
// seam admitted whatever tables the caller named, so it read every session.
describe("the features — a feature's own entries", () => {
  it('reach the tables that feature named as its own', async () => {
    const tagging = keeping('tagging');
    const { start } = await world([{ ...tagging.feature, tables: { names: ['tags'] } }]);
    await start();
    const replay = await tagging.seams().ownEntries([TAGS]);
    expect(await replay('tagging/all', {})).toEqual([{ id: 1, body: 'first' }]);
  });

  it('a feature that names no table reads none: an entry over a table of the app is refused when it is handed over', async () => {
    const probe = keeping('probe');
    const { start } = await world([probe.feature]);
    await start();
    await expect(probe.seams().ownEntries([NOTES])).rejects.toThrow(
      /^moss: the feature "probe" handed over an entry that reads or writes a table that is not its own: "probe\/notes"\. Its own entries run outside the app's policy, so they reach no table, because it names none as its own\./,
    );
  });

  it("one feature's seams do not reach another feature's table", async () => {
    const tagging = keeping('tagging');
    const probe = keeping('probe');
    const { start } = await world([{ ...tagging.feature, tables: { names: ['tags'] } }, { ...probe.feature, tables: { names: ['notes'] } }]);
    await start();
    await expect(probe.seams().ownEntries([TAGS])).rejects.toThrow(/the feature "probe" handed over an entry that reads or writes a table that is not its own: "tagging\/all"/);
    await expect(tagging.seams().ownEntries([NOTES])).rejects.toThrow(/the feature "tagging" handed over an entry/);
  });

  // The server asks with the cache the deployment handed its runtime: the
  // table that one keeps vex's entries in is the core's, whatever it is
  // called (data.test.ts). Refused while the data module is being put
  // together, so the database has been asked nothing.
  it('a feature that names the table the deployment’s own cache is kept in refuses the boot, before the database is asked anything', () => {
    const asked: string[] = [];
    const pool = { query: async (text: string) => (asked.push(text), { rows: [] }) };
    const probe = keeping('probe');
    const app = { charter, actions: {}, features: [{ ...probe.feature, tables: { names: ['replayed_entries'] } }] };
    expect(() => buildData(app, { pool, db: pool, session: 'dev-open', cache: createPostgresCache({ pool, table: 'replayed_entries' }) })).toThrow(
      /^moss: the feature "probe" names the table "replayed_entries" as its own, and it is the core's: the entries vex replays\./,
    );
    expect(asked).toEqual([]);
  });
});

const roster: ActionDefinition = { id: 'ext.desk.belts.roster' };
const checkout: ActionDefinition = { id: 'ext.desk.pay.checkout' };

// ONE WRITER FOR A SET OF ACTIONS. A feature's set is kept under the feature's
// name and written through that feature's seams, which name no set: it was
// `replaceActions(source, actions)`, and any feature wrote any set by naming
// it, the app's and another feature's alike.
describe("the features — a feature's set of actions", () => {
  it('is its own: the seam names no set, and what one feature hands over leaves another feature\'s set alone', async () => {
    const belts = keeping('belts');
    const pay = keeping('pay');
    const { start, running } = await world([belts.feature, pay.feature]);
    await start();
    belts.seams().replaceActions({ [roster.id]: roster });
    pay.seams().replaceActions({ [checkout.id]: checkout });
    expect(Object.keys(running.actions())).toEqual(['home', roster.id, checkout.id]);
    // Handing over another set of its own replaces its own, and nothing else.
    pay.seams().replaceActions({});
    expect(Object.keys(running.actions())).toEqual(['home', roster.id]);
  });

  // `server.replaceActions` and `server.verifyActions` are these two. The
  // first does, so it throws. The second is asked whether the first would
  // take a set, and that is a question with an answer: it threw too, so a
  // caller asking "would this be taken" had to catch to learn "no".
  it('is not the app\'s to replace: handing one over under its name throws, naming whose it is', async () => {
    const belts = keeping('belts');
    const { start, running } = await world([belts.feature]);
    await start();
    belts.seams().replaceActions({ [roster.id]: roster });
    expect(() => running.replace('belts', {})).toThrow(/^moss: the set of actions "belts" is the feature "belts"'s, and only its owner replaces it\./);
    expect(Object.keys(running.actions())).toEqual(['home', roster.id]);
  });

  it('…and asked whether it would be taken, the answer is a report that says the same, with whatever else would refuse', async () => {
    const belts = keeping('belts');
    const { start, running } = await world([belts.feature]);
    await start();
    belts.seams().replaceActions({ [roster.id]: roster });

    const asked = running.verifyReplace('belts', {});
    expect(asked.errors).toEqual([{ check: 'owner', detail: 'the set of actions "belts" is the feature "belts"\'s, and only its owner replaces it. An app hands a set over under a name of its own.' }]);
    // The sentence is the one the door throws.
    expect(() => running.replace('belts', {})).toThrow(`moss: ${asked.errors[0]?.detail}`);
    // The candidate is verified like any other: what else would refuse it is said too.
    const unreadable = running.verifyReplace('belts', { 'ext.broken': { id: 'ext.broken', triggers: [{ do: [] }] } });
    expect(unreadable.errors.map((error) => error.check)).toEqual(['owner', 'actions']);
    // A set of the app's own is answered as it was.
    expect(running.verifyReplace('extras', {}).errors).toEqual([]);
    // Nothing changed for the asking.
    expect(Object.keys(running.actions())).toEqual(['home', roster.id]);
  });

  it('is read again through the loader that feature named, when another process says something changed', async () => {
    const belts = keeping('belts');
    const { start, parts } = await world([belts.feature]);
    await start();
    const rows: { now: Record<string, ActionDefinition> } = { now: { [roster.id]: roster } };
    belts.seams().setActionsLoader(async () => rows.now);
    // A second feature of that name cannot be started beside it: the name is
    // what the set is kept under.
    await expect(startFeatures([keeping('belts').feature], parts)).rejects.toThrow(/^moss: the set of actions "belts" is the feature "belts"'s, and the feature "belts" claims it too\./);
  });
});
