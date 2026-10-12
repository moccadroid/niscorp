import { Hono } from 'hono';
import { createIdentity, sessionRemainingMs, sessionRevokerOf, sessionVerifierOf } from '../identity';
import type { Identity } from '../identity';
import { createData, featureTablesOf } from '../data';
import type { Data } from '../data';
import { createRunningManifest, receiveManifest } from '../manifest';
import type { NiscApp, RunningManifest } from '../manifest';
import type { NiscRuntime, SessionVerifier } from '../runtime';
import { DEFAULT_REVALIDATE_MS, createSocket } from '../socket';
import type { SocketAccept } from '../socket';
import type { Env, MossServer } from './moss-server';
import { composeWireWraps, emptyRegister, startFeatures } from './features';
import { buildShellHosts, createInternalWire } from './hosts';
import type { Hosts } from './hosts';
import { mountRoutes, operatorPrefix } from './routes';
import { buildSignals } from './signals';

export const createServerWith = async (app: NiscApp, runtime: NiscRuntime, dataOf: (app: NiscApp, runtime: NiscRuntime) => Promise<Data>): Promise<MossServer> => {
  // This and the verifier below refuse before a table is created.
  receiveManifest(app);

  const session = sessionVerifierOf(runtime);
  const revokeSessions = sessionRevokerOf(runtime);

  const data = await dataOf(app, runtime);

  return assembleServer({ app, runtime, session, revokeSessions, data });
};

export const createServer = (app: NiscApp, runtime: NiscRuntime): Promise<MossServer> => createServerWith(app, runtime, buildData);

const buildData = (app: NiscApp, runtime: NiscRuntime): Promise<Data> =>
  createData({
    pool: runtime.pool,
    db: runtime.db,
    cache: runtime.cache,
    vexConfig: runtime.vexConfig,
    migrations: runtime.migrations,
    storesSessions: runtime.session === 'sessions',
    featureTables: featureTablesOf(app),
    tables: runtime.tables,
    grammars: app.grammars,
    charter: app.charter,
    behaviors: app.behaviors,
    telemetry: runtime.telemetry,
  });

export type ServerDeps = {
  app: NiscApp;
  runtime: NiscRuntime;
  session: SessionVerifier;
  revokeSessions: ((principal: string) => Promise<void>) | undefined;
  data: Data;
};

export const assembleServer = async (deps: ServerDeps): Promise<MossServer> => {
  const stops: (() => void)[] = [];
  try {
    return await assemble(deps, stops);
  } catch (error) {
    for (const stop of stops) stop();
    throw error;
  }
};

const assemble = async ({ app, runtime, session, revokeSessions, data }: ServerDeps, stops: (() => void)[]): Promise<MossServer> => {
  const running = await buildRunningManifest(app, runtime, data);
  stops.push(running.stop);

  const identity = buildIdentity(app, runtime, data);
  stops.push(identity.stop);

  const server = new Hono<Env>();
  // Filled by the features as they start, after this: its members are read
  // when they are used, not when they are handed on.
  const registered = emptyRegister();
  mountRoutes(server, { app, session, credentials: registered.credentials, identity, running, data });

  const hosts = buildShellHosts({ app, runtime, identity, running, data, wire: createInternalWire(server), wrapWire: composeWireWraps(registered), revokeSessions });
  stops.push(hosts.stop);

  const signals = buildSignals({ fabric: runtime.fabric, identity, reset: hosts.reset, deliver: hosts.deliver });

  running.onChange(() => {
    // Before the adopt, which resolves each principal again.
    identity.invalidateAll();
    hosts.adopt();
  });

  const operator = operatorPrefix(runtime);
  // The features mount their routes before the operator prefix is mounted: a
  // prefix's routes are taken when it is mounted.
  await startFeatures(app.features ?? [], { app, runtime, server, operator, registered, identity, running, data });
  server.route('/operator', operator);
  subscribeReactions({ app, onWrite: data.onWrite, deliver: signals.deliver });

  // Watched only once the features have started: a set of actions a feature
  // hands over while it starts moves nobody's pointer.
  running.watch();

  const socket = buildSocket({ runtime, session, identity, running, hosts });
  stops.push(socket.stop);

  return Object.assign(server, {
    socket,
    principalOf: async (token: string) => session(token),
    page: hosts.pageAt,
    pages: hosts.pages,
    ...(hosts.shells !== undefined ? { shells: hosts.shells } : {}),
    refresh: running.refresh,
    replaceActions: running.replace,
    actions: running.actions,
    catalogOf: async (principal: string | null) => {
      const resolved = await identity.resolve(principal);
      return running.catalogFor(resolved.roles, resolved.installed);
    },
    policyForRoles: data.policyForRoles,
    charterReport: () => running.report().charter,
    close: () => {
      for (const stop of stops) stop();
    },
    executeAs: data.executeAs,
    identity: async (principal: string | null) => {
      const resolved = await identity.resolve(principal);
      return { roles: resolved.roles, scope: resolved.scope, ...(resolved.installed !== undefined ? { installed: resolved.installed } : {}) };
    },
    invalidateTenant: signals.invalidateTenant,
    invalidateIdentity: signals.invalidateIdentity,
    nudge: signals.nudge,
    ...(identity.roster !== undefined ? { identities: identity.roster } : {}),
  });
};

export const buildRunningManifest = async (
  app: NiscApp,
  runtime: Pick<NiscRuntime, 'sessionRevalidateMs'>,
  data: Pick<Data, 'grants' | 'dropOnChange' | 'pointer' | 'seed'>,
): Promise<RunningManifest> => {
  const running = createRunningManifest({
    shipped: app,
    grants: data.grants,
    // Polled on the clock a socket's credential is re-verified on.
    pointer: { read: data.pointer.read, move: data.pointer.move, ...(runtime.sessionRevalidateMs !== undefined ? { everyMs: runtime.sessionRevalidateMs } : {}) },
  });
  data.dropOnChange(running.onChange);
  // Seeded only after `createRunningManifest` has verified the manifest: one
  // that is refused has written no row.
  await data.seed(running.entries());
  return running;
};

const buildIdentity = (
  app: Pick<NiscApp, 'identity' | 'assignments' | 'scope'>,
  runtime: Pick<NiscRuntime, 'identityMax' | 'identityIdleMs' | 'sessionRevalidateMs'>,
  data: Pick<Data, 'executeAs'>,
): Identity =>
  createIdentity({
    seam: app.identity,
    assignments: app.assignments,
    scope: app.scope,
    readAs: (role, fingerprint, scope) => data.executeAs(role, fingerprint, {}, scope),
    max: runtime.identityMax,
    idleMs: runtime.identityIdleMs,
    revalidateMs: runtime.sessionRevalidateMs ?? DEFAULT_REVALIDATE_MS,
  });

export type SocketDeps = {
  runtime: Pick<NiscRuntime, 'pool' | 'session' | 'sessionRevalidateMs' | 'anonymousShellMax' | 'telemetry' | 'origins' | 'socketCompression' | 'socketMaxMessageBytes'>;
  session: SessionVerifier;
  identity: Pick<Identity, 'resolve'>;
  running: Pick<RunningManifest, 'catalogFor'>;
  hosts: Pick<Hosts, 'shells' | 'pageAt'>;
};

export const buildSocket = ({ runtime, session, identity, running, hosts }: SocketDeps): SocketAccept => {
  const socket = createSocket({
    session,
    catalog: async (principal) => {
      const resolved = await identity.resolve(principal);
      return running.catalogFor(resolved.roles, resolved.installed);
    },
    ...(hosts.shells !== undefined ? { shells: hosts.shells } : {}),
    page: hosts.pageAt,
    ...(runtime.sessionRevalidateMs !== undefined ? { revalidateMs: runtime.sessionRevalidateMs } : {}),
    ...(runtime.anonymousShellMax !== undefined ? { anonymousShellMax: runtime.anonymousShellMax } : {}),
    ...(runtime.telemetry !== undefined ? { telemetry: runtime.telemetry } : {}),
    ...(runtime.origins !== undefined ? { origins: runtime.origins } : {}),
    ...(runtime.session === 'sessions' ? { sessionLastsMs: (token: string) => sessionRemainingMs(runtime.pool, token) } : {}),
  });
  return Object.assign(socket, {
    transport: {
      ...(runtime.socketCompression !== undefined ? { compression: runtime.socketCompression } : {}),
      ...(runtime.socketMaxMessageBytes !== undefined ? { maxMessageBytes: runtime.socketMaxMessageBytes } : {}),
    },
  });
};

export type ReactionDeps = {
  app: Pick<NiscApp, 'reactions'>;
  onWrite: Data['onWrite'];
  deliver: (principal: string, channel: string, payload?: unknown) => boolean;
};

export const subscribeReactions = ({ app, onWrite, deliver }: ReactionDeps): void => {
  const reactions = app.reactions;
  if (reactions === undefined) return;
  onWrite((event) => {
    const tools = { deliver };
    for (const write of event.writes) {
      if (write.rows.length === 0) continue;
      for (const reaction of reactions) {
        if (reaction.table !== write.table || (reaction.op !== undefined && reaction.op !== write.op)) continue;
        try {
          reaction.run({ fingerprint: event.fingerprint, table: write.table, op: write.op, count: write.rows.length, scope: event.scope }, tools);
        } catch (err) {
          console.error('[moss:reactions]', err);
        }
      }
    }
  });
};
