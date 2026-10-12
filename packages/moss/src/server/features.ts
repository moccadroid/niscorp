import type { Hono } from 'hono';
import type { FetchFn } from '@niscorp/nova';
import type { Data } from '../data';
import type { Feature, FeatureSeams } from '../feature';
import type { Identity } from '../identity';
import { endlessChains, layoutMisfits, refusalOf } from '../manifest';
import type { KitComponents, NiscApp, OwnedActions, RunningManifest } from '../manifest';
import type { NiscRuntime } from '../runtime';
import type { FeatureCredential } from './routes';
import type { Env } from './moss-server';

export type Registered = {
  credentials: FeatureCredential[];
  wireWraps: ((inner: FetchFn) => FetchFn)[];
};

export const emptyRegister = (): Registered => ({ credentials: [], wireWraps: [] });

export const composeWireWraps =
  (registered: Registered) =>
  (inner: FetchFn): FetchFn =>
    registered.wireWraps.reduce((wire, wrap) => wrap(wire), inner);

export type SeamDeps = {
  app: Pick<NiscApp, 'charter' | 'shell'>;
  runtime: Pick<NiscRuntime, 'telemetry'>;
  server: Hono<Env>;
  operator: Hono<Env>;
  registered: Registered;
  identity: Pick<Identity, 'resolve' | 'scopeValuesFor'>;
  running: Pick<RunningManifest, 'catalogFor' | 'actions' | 'claim' | 'verify' | 'addCatalogFilter'>;
  data: Pick<Data, 'ownEntries' | 'grammars' | 'upgradeStore' | 'fingerprints' | 'fingerprintsFor' | 'onWrite'>;
};

export const seamsOf = (feature: Pick<Feature, 'name'>, { app, runtime, server, operator, registered, identity, running, data }: SeamDeps): FeatureSeams => {
  const actions = running.claim(feature.name, `the feature "${feature.name}"`);
  return seamsFor(feature, actions, { app, runtime, server, operator, registered, identity, running, data });
};

const kitOf = (app: Pick<NiscApp, 'shell'>): KitComponents => new Map(Object.entries(app.shell?.components ?? {}).map(([name, contract]) => [name, { propsSchema: contract.meta?.propsSchema }]));

const seamsFor = (feature: Pick<Feature, 'name'>, owned: OwnedActions, { app, runtime, server, operator, registered, identity, running, data }: SeamDeps): FeatureSeams => ({
  mountRoutes: (routes) => {
    server.route('/', routes);
  },
  mountOperatorRoutes: (routes) => {
    operator.route('/', routes);
  },
  registerCredential: (prefix, principalOf) => {
    registered.credentials.push({ prefix, principalOf });
  },
  resolveIdentity: identity.resolve,
  scopeOf: identity.scopeValuesFor,
  grantedActionIds: (roles, installed) => running.catalogFor(roles, installed).ids,
  actions: running.actions,
  replaceActions: owned.replace,
  refusalOf: (actions) => refusalOf(running.verify(actions), 'refresh'),
  setActionsLoader: owned.setLoader,
  addCatalogFilter: running.addCatalogFilter,
  charter: app.charter,
  components: app.shell?.components ?? {},
  layoutMisfits: (layout) => layoutMisfits(layout, kitOf(app)),
  endlessChains,
  ownEntries: (entries) => data.ownEntries(feature.name, entries),
  grammars: data.grammars,
  upgradeStore: (store) => data.upgradeStore(feature.name, store),
  fingerprints: data.fingerprints,
  fingerprintsFor: async (principal) => data.fingerprintsFor(await identity.resolve(principal)),
  onWrite: data.onWrite,
  telemetry: runtime.telemetry,
  wrapWire: (wrap) => {
    registered.wireWraps.push(wrap);
  },
});

export const startFeatures = async (features: readonly Feature[], deps: SeamDeps): Promise<void> => {
  for (const feature of features) await feature.start(seamsOf(feature, deps));
};
