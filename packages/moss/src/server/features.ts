import type { Hono } from 'hono';
import type { FetchFn } from '@niscorp/nova';
import type { Data } from '../data';
import type { Feature, FeatureSeams } from '../feature';
import type { Identity } from '../identity';
import { refusalOf } from '../manifest';
import type { NiscApp, RunningManifest } from '../manifest';
import type { NiscRuntime } from '../runtime';
import type { FeatureCredential } from './authenticate';
import type { Env } from './moss-server';

// ═══════════════════════════════════════════════════════════════
// THE SEAMS A FEATURE IS STARTED WITH (../feature), assembled from what the
// core modules offer.
//
// Each member is one function or one narrow value of the module that owns it,
// and nothing of the manifest or the runtime beside what is named.
// ═══════════════════════════════════════════════════════════════

// WHAT A FEATURE REGISTERS, read by the surfaces each time they are asked: a
// credential of its own, by the prefix its tokens carry; and what is laid
// around the wire a session's screens call through.
export type Registered = {
  credentials: FeatureCredential[];
  wireWraps: ((inner: FetchFn) => FetchFn)[];
};

export const emptyRegister = (): Registered => ({ credentials: [], wireWraps: [] });

// The wire with every wrap a feature registered laid around it, in the order
// they were registered.
export const wrappedBy =
  (registered: Registered) =>
  (inner: FetchFn): FetchFn =>
    registered.wireWraps.reduce((wire, wrap) => wrap(wire), inner);

export type SeamParts = {
  app: Pick<NiscApp, 'charter' | 'shell'>;
  runtime: Pick<NiscRuntime, 'telemetry' | 'signingSeed'>;
  // The server's root and its operator prefix: where a feature's routes go.
  server: Hono<Env>;
  operator: Hono<Env>;
  registered: Registered;
  identity: Pick<Identity, 'resolve' | 'scopeValuesFor'>;
  running: Pick<RunningManifest, 'catalogFor' | 'actions' | 'replace' | 'verify' | 'loadFrom' | 'narrowCatalogs'>;
  data: Pick<Data, 'ownEntries' | 'grammars' | 'engine' | 'fingerprintsFor' | 'onWrite'>;
};

export const seamsOf = (feature: Pick<Feature, 'name'>, { app, runtime, server, operator, registered, identity, running, data }: SeamParts): FeatureSeams => ({
  routes: (routes) => {
    server.route('/', routes);
  },
  operatorRoutes: (routes) => {
    operator.route('/', routes);
  },
  credential: (prefix, principalOf) => {
    registered.credentials.push({ prefix, principalOf });
  },
  who: identity.resolve,
  scopeOf: identity.scopeValuesFor,
  holds: (roles, installed) => running.catalogFor(roles, installed).ids,
  actions: running.actions,
  replaceActions: running.replace,
  refusalOf: (actions) => refusalOf(running.verify(actions), 'refresh'),
  loadActionsFrom: running.loadFrom,
  narrowCatalogs: running.narrowCatalogs,
  charter: app.charter,
  components: app.shell?.components ?? {},
  // The tables are the ones this feature named as its own, and it cannot say
  // otherwise here.
  ownEntries: (entries) => data.ownEntries(feature.name, entries),
  grammars: data.grammars,
  fingerprints: async () => (await data.engine.cache.keys?.()) ?? [],
  // A principal the charter cannot resolve is refused here, as it is on
  // every other route.
  fingerprintsFor: async (principal) => data.fingerprintsFor(await identity.resolve(principal)),
  onWrite: data.onWrite,
  telemetry: runtime.telemetry,
  signingSeed: runtime.signingSeed,
  wrapWire: (wrap) => {
    registered.wireWraps.push(wrap);
  },
});

// THE FEATURES ARE STARTED, in the order the app named them. EACH WITH SEAMS
// OF ITS OWN: anybody can write a feature, so what one is handed is made for
// that feature and is no other's to reach through. One that throws refuses
// the boot.
export const startFeatures = async (features: readonly Feature[], parts: SeamParts): Promise<void> => {
  for (const feature of features) await feature.start(seamsOf(feature, parts));
};
