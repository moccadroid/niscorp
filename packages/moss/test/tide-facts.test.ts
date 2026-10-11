import { describe, it, expect, vi } from 'vitest';
import type { WriteEvent } from '@niscorp/vex';
import { createGrammarUpgrader } from '../src/data/engine';
import type { FeatureSeams } from '../src/feature';
import { createTideFacts } from '../src/tide';
import type { TideFactsConfig } from '../src/tide';
import type { FactIntake } from '../src/tide/feature';
import { mintFromWrites } from '../src/tide/feature';
import { turn } from './turn';

// THE WRITE-FACT BRIDGE, AS A FEATURE: handed the one seam it uses, a write
// reported to it by hand, and an intake that keeps what it is given. No
// database, no server and no tide.

type Listener = Parameters<FeatureSeams['onWrite']>[0];
type Minted = { fact: Parameters<FactIntake['ingest']>[0]; options: Parameters<FactIntake['ingest']>[1] };

// The seam: it keeps who subscribed, and `report` tells them of a write.
const writes = () => {
  const listeners = new Set<Listener>();
  const onWrite: FeatureSeams['onWrite'] = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  // `headers`: what the request that wrote said, as the core hands it on.
  const report = (event: WriteEvent, headers: Record<string, string> = {}): void => {
    for (const listener of listeners) listener(event, { header: (name) => headers[name] });
  };
  return { onWrite, report, listening: () => listeners.size };
};

// An intake that keeps every fact it is handed, with what it was handed beside it.
const intake = () => {
  const minted: Minted[] = [];
  const tide: FactIntake = {
    ingest: async (fact, options) => {
      minted.push({ fact, options });
      return undefined;
    },
  };
  return { tide, minted };
};

// Minting is not awaited by the lane: let what was started finish.
const settled = async (): Promise<void> => {
  await turn();
};

const twoStatements: WriteEvent = {
  fingerprint: 'bookings/move',
  writes: [
    { table: 'bookings', op: 'update', rows: [{ id: 1 }, { id: 2 }] },
    // A statement the scope narrowed to nothing: it changed nothing.
    { table: 'waitlist', op: 'delete', rows: [] },
    { table: 'audit', op: 'insert', rows: [{ id: 9 }] },
  ],
  scope: { userId: 'usr_1', studio: 'north' },
};

const studioOf: TideFactsConfig['identity'] = (scope) => (typeof scope['studio'] === 'string' ? `automation@${scope['studio']}` : undefined);

describe('a write, minted into tide as facts', () => {
  it('mints one fact for each row a statement returned, for the identity the write’s scope names', async () => {
    const lane = writes();
    const { tide, minted } = intake();
    mintFromWrites({ tide: () => tide, identity: studioOf }, lane);
    lane.report(twoStatements);
    await settled();
    expect(minted.map(({ fact }) => ({ kind: fact.kind, entity: fact.entity, op: fact.op, row: fact.row }))).toEqual([
      { kind: 'write', entity: 'bookings', op: 'update', row: { id: 1 } },
      { kind: 'write', entity: 'bookings', op: 'update', row: { id: 2 } },
      { kind: 'write', entity: 'audit', op: 'insert', row: { id: 9 } },
    ]);
    expect(minted.map(({ options }) => options)).toEqual([{ as: 'automation@north' }, { as: 'automation@north' }, { as: 'automation@north' }]);
    // One write is one moment: every fact of it carries the same stamp.
    expect(new Set(minted.map(({ fact }) => fact.at)).size).toBe(1);
  });

  it('mints nothing for a write whose scope names no identity', async () => {
    const lane = writes();
    const { tide, minted } = intake();
    mintFromWrites({ tide: () => tide, identity: studioOf }, lane);
    lane.report({ ...twoStatements, scope: { userId: 'operator' } });
    await settled();
    expect(minted).toEqual([]);
  });

  it('mints nothing while there is no tide to mint into, and does not ask whose write it was', async () => {
    const lane = writes();
    const identity = vi.fn(studioOf);
    mintFromWrites({ tide: () => undefined, identity }, lane);
    lane.report(twoStatements);
    await settled();
    expect(identity).not.toHaveBeenCalled();
  });

  it('asks for the tide at each write, so one that stands up later is minted into', async () => {
    const lane = writes();
    const { tide, minted } = intake();
    const standing: { tide: FactIntake | undefined } = { tide: undefined };
    mintFromWrites({ tide: () => standing.tide, identity: studioOf }, lane);
    lane.report(twoStatements);
    standing.tide = tide;
    lane.report(twoStatements);
    await settled();
    expect(minted).toHaveLength(3);
  });
});

// THE FEATURE READS ITS OWN HEADERS. A tide effect that writes back through
// vex names its place in two headers, and they are this feature's: the core
// hands on what the request said, and the reading is here.
describe('the place in a chain a request named', () => {
  const named = { cause: 'task:t_1', depth: 2 };
  const headers = { 'x-tide-cause': 'task:t_1', 'x-tide-depth': '2' };

  it('is dropped when the app has no gate', async () => {
    const lane = writes();
    const { tide, minted } = intake();
    mintFromWrites({ tide: () => tide, identity: studioOf }, lane);
    lane.report(twoStatements, headers);
    await settled();
    expect(minted[0]?.options).toEqual({ as: 'automation@north' });
  });

  it('is dropped when the gate does not take that caller’s word', async () => {
    const lane = writes();
    const { tide, minted } = intake();
    mintFromWrites({ tide: () => tide, identity: studioOf, chain: () => undefined }, lane);
    lane.report(twoStatements, headers);
    await settled();
    expect(minted[0]?.options).toEqual({ as: 'automation@north' });
  });

  it('rides the facts one hop deeper when the gate takes it, and the gate is handed the write’s scope', async () => {
    const lane = writes();
    const { tide, minted } = intake();
    const chain = vi.fn<NonNullable<TideFactsConfig['chain']>>((_scope, hints) => hints);
    mintFromWrites({ tide: () => tide, identity: studioOf, chain }, lane);
    lane.report(twoStatements, headers);
    await settled();
    expect(chain).toHaveBeenCalledWith(twoStatements.scope, named);
    expect(minted.map(({ options }) => options)).toEqual(Array.from({ length: 3 }, () => ({ as: 'automation@north', cause: 'task:t_1', depth: 3 })));
  });

  it('is not asked about when the request named none', async () => {
    const lane = writes();
    const { tide } = intake();
    const chain = vi.fn<NonNullable<TideFactsConfig['chain']>>((_scope, hints) => hints);
    mintFromWrites({ tide: () => tide, identity: studioOf, chain }, lane);
    lane.report(twoStatements);
    await settled();
    expect(chain).not.toHaveBeenCalled();
  });

  // What the gate is asked about, for what a request said in the two headers.
  const askedAbout = async (said: Record<string, string>): Promise<unknown> => {
    const lane = writes();
    const { tide } = intake();
    const chain = vi.fn<NonNullable<TideFactsConfig['chain']>>((_scope, hints) => hints);
    mintFromWrites({ tide: () => tide, identity: studioOf, chain }, lane);
    lane.report(twoStatements, said);
    await settled();
    return chain.mock.calls[0]?.[1];
  };

  it('a position that does not read as one is no position: the gate is not asked', async () => {
    expect(await askedAbout({ 'x-tide-depth': '2' })).toBeUndefined();
    expect(await askedAbout({ 'x-tide-cause': '', 'x-tide-depth': '2' })).toBeUndefined();
    expect(await askedAbout({ 'x-tide-cause': 'f_1' })).toBeUndefined();
    expect(await askedAbout({ 'x-tide-cause': 'f_1', 'x-tide-depth': '-1' })).toBeUndefined();
    expect(await askedAbout({ 'x-tide-cause': 'f_1', 'x-tide-depth': '1.5' })).toBeUndefined();
    expect(await askedAbout({ 'x-tide-cause': 'f_1', 'x-tide-depth': 'deep' })).toBeUndefined();
  });

  // `Number()` reads more than a number: an empty header is 0, and so is one of
  // spaces. A request that names a cause and an empty depth must not be heard
  // at depth 0, the start of a chain: a chain whose depth was lost on the way
  // is not counted from the beginning.
  it.each([
    ['empty', ''],
    ['spaces', '  '],
    ['written in hex', '0x2'],
    ['written with an exponent', '1e1'],
    ['signed', '+2'],
    ['more than a whole number can hold', '9'.repeat(30)],
  ])('a depth that is %s is no position', async (_label, depth) => {
    expect(await askedAbout({ 'x-tide-cause': 'f_1', 'x-tide-depth': depth })).toBeUndefined();
  });

  it('a depth of 0 is a position, written as String(depth) writes it', async () => {
    expect(await askedAbout({ 'x-tide-cause': 'f_1', 'x-tide-depth': '0' })).toEqual({ cause: 'f_1', depth: 0 });
  });
});

describe('an intake that fails', () => {
  it('is logged, and whoever reported the write is thrown nothing', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const lane = writes();
    const failing: FactIntake = {
      ingest: async () => {
        throw new Error('the ledger is closed');
      },
    };
    mintFromWrites({ tide: () => failing, identity: studioOf }, lane);
    expect(() => lane.report(twoStatements)).not.toThrow();
    await settled();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]?.[0]).toBe('[moss:facts]');
    logged.mockRestore();
  });
});

describe('createTideFacts — the feature', () => {
  // Every seam but the one it is for answers by throwing its own name.
  const seamsThatOnlyHear = async (onWrite: FeatureSeams['onWrite']): Promise<FeatureSeams> => {
    const notAsked = (seam: string) => (): never => {
      throw new Error(`the feature asked for ${seam}`);
    };
    return {
      mountRoutes: notAsked('mountRoutes'),
      mountOperatorRoutes: notAsked('mountOperatorRoutes'),
      registerCredential: notAsked('registerCredential'),
      resolveIdentity: notAsked('resolveIdentity'),
      scopeOf: notAsked('scopeOf'),
      grantedActionIds: notAsked('grantedActionIds'),
      actions: notAsked('actions'),
      replaceActions: notAsked('replaceActions'),
      refusalOf: notAsked('refusalOf'),
      setActionsLoader: notAsked('setActionsLoader'),
      addCatalogFilter: notAsked('addCatalogFilter'),
      charter: {},
      components: {},
      layoutMisfits: notAsked('layoutMisfits'),
      endlessChains: notAsked('endlessChains'),
      ownEntries: notAsked('ownEntries'),
      grammars: await createGrammarUpgrader({}),
      upgradeStore: notAsked('upgradeStore'),
      fingerprints: notAsked('fingerprints'),
      fingerprintsFor: notAsked('fingerprintsFor'),
      onWrite,
      telemetry: undefined,
      wrapWire: notAsked('wrapWire'),
    };
  };

  it('is started with the seams, hears writes, and asks the server for nothing else', async () => {
    const lane = writes();
    const { tide, minted } = intake();
    const feature = createTideFacts({ tide: () => tide, identity: studioOf });
    expect(feature.name).toBe('tide-facts');
    // It keeps no tables: tide's are tide's, migrated by whoever keeps them.
    expect(feature.tables).toBeUndefined();
    await feature.start(await seamsThatOnlyHear(lane.onWrite));
    expect(lane.listening()).toBe(1);
    lane.report(twoStatements);
    await settled();
    expect(minted).toHaveLength(3);
  });
});
