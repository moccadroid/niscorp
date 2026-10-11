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
import { subscribeReactions } from './reactions';
import { mountRoutes, operatorPrefix } from './routes';
import { buildSignals } from './signals';

// ═══════════════════════════════════════════════════════════════
// createServer — the wiring, and nothing else.
//
// The app hands over its ARTIFACTS (../manifest) and an environment
// (../runtime); everything mechanical is derived by the module that owns it.
// This function constructs the modules, hands each the narrow things it
// needs, starts the features and mounts the routes. It answers no question of
// its own: each step is one line, and a function below or in a file beside
// this one. The first three are `createServerWith`'s; the ones that stand over
// the data module are `assembleServer`'s.
//
// The server refuses to boot incoherent (DESIGN.md § Derivation over
// configuration: coherence is refused, not documented), and each refusal is
// the step's that finds it.
// ═══════════════════════════════════════════════════════════════

// THE BOOT, IN ITS ORDER, over whatever brings the data module up. It is what
// `createServer` does, with the one step that asks a database handed in, for
// the reason `createDataWith` and `assembleServer` are functions of their own: the
// order of these steps can be held with nothing behind it. A manifest that
// does not parse refuses before `dataOf` is called at all.
export const createServerWith = async (app: NiscApp, runtime: NiscRuntime, dataOf: (app: NiscApp, runtime: NiscRuntime) => Promise<Data>): Promise<MossServer> => {
  // 1. WHAT WAS HANDED OVER IS READ FIRST, AND THEN FROZEN (../manifest, the
  // hand-over): nothing below may meet a manifest no schema has read, and
  // nothing after may write one. One that does not parse refuses here, before
  // a table is created or a row is read.
  receiveManifest(app);

  // 2. WHO A TOKEN IS, resolved before anything else boots: an unset verifier
  // refuses HERE, with a sentence, instead of serving every forged principal
  // silently. 'dev-open' announces itself on this line.
  // And how every session a principal holds is forgotten at a sign-out, where
  // the deployment keeps the credential itself.
  const session = sessionVerifierOf(runtime);
  const revokeSessions = sessionRevokerOf(runtime);

  // 3. The tables are migrated and `data` stands (`buildData`, below).
  const data = await dataOf(app, runtime);

  // 4 to 13. Everything that stands over the data module (`assembleServer`,
  // below).
  return assembleServer({ app, runtime, session, revokeSessions, data });
};

export const createServer = (app: NiscApp, runtime: NiscRuntime): Promise<MossServer> => createServerWith(app, runtime, buildData);

// WHAT SOMEBODY MAY READ AND WRITE, for every surface (../data). It runs the
// tables' one ledgered run, brings the documents stored in them to this
// code's grammars, and stands the engine up over what is there — in that
// order, because a table created after the engine has looked is a table no
// grant can reach. It is handed the database, the tables, the charter and the
// row behaviors, and where a span goes; who a request is, it is told for each
// request. The entries it serves are not read off the app here: the running
// manifest holds them and hands them over when it stands
// (`buildRunningManifest`, below).
const buildData = (app: NiscApp, runtime: NiscRuntime): Promise<Data> =>
  createData({
    pool: runtime.pool,
    db: runtime.db,
    cache: runtime.cache,
    vexConfig: runtime.vexConfig,
    migrations: runtime.migrations,
    storesSessions: runtime.session === 'sessions',
    // The tables the features keep, so they are there before a feature starts.
    featureTables: featureTablesOf(app),
    tables: runtime.tables,
    grammars: app.grammars,
    charter: app.charter,
    behaviors: app.behaviors,
    telemetry: runtime.telemetry,
  });

// THE SERVER, ASSEMBLED OVER THE DATA MODULE — steps 4 to 13 of `createServer`,
// which reads the manifest, resolves the session verifier and brings the
// database up before it calls this.
//
// A function of its own because everything here stands over what the data
// module answers and touches no database itself: it can be held against a
// data module with no database behind it.

export type ServerDeps = {
  app: NiscApp;
  runtime: NiscRuntime;
  // Who a token is (step 2), and how every session a principal holds is
  // forgotten, where the deployment keeps the credential itself.
  session: SessionVerifier;
  revokeSessions: ((principal: string) => Promise<void>) | undefined;
  // What somebody may read and write (step 3).
  data: Data;
};

// WHAT A BOOT STARTED, A BOOT THAT FAILS STOPS. Three of the steps below start
// a timer (the identity cache's sweep, each shell host's, the socket's
// revalidation) and a fourth starts one later (the generation poll). A server
// that is returned has `close` for all of them. One that is not returned, a
// feature that throws when it is started, a page the router refuses, has
// nobody holding anything to stop them by: so each step that starts something
// says here how it is stopped, and a throw stops them before it goes on up.
// `close` on the server that IS returned runs the same list.
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
  // 4. The running manifest: creating it is the boot check, and it hands the
  // data module the entries to seed (`buildRunningManifest`, below).
  const running = await buildRunningManifest(app, runtime, data);
  stops.push(running.stop);

  // 5. Identity (`buildIdentity`, below).
  const identity = buildIdentity(app, runtime, data);
  stops.push(identity.stop);

  // 6. The server's own surfaces (./routes.ts): the authentication, the
  // catalog and vex. `registered` is what a feature adds to them when it
  // starts: a credential the authentication reads, a wrap around the wire.
  const server = new Hono<Env>();
  const registered = emptyRegister();
  mountRoutes(server, { app, session, credentials: registered.credentials, identity, running, data });

  // 7. The shell hosts, the app's and each page's (./hosts.ts). Their
  // endpoint calls ride the server's OWN surfaces with the session's token
  // (`createInternalWire`): same wire, same enforcement.
  const hosts = buildShellHosts({ app, runtime, identity, running, data, wire: createInternalWire(server), wrapWire: composeWireWraps(registered), revokeSessions });
  stops.push(hosts.stop);

  // 8. What crosses processes (./signals.ts).
  const signals = buildSignals({ fabric: runtime.fabric, identity, reset: hosts.reset, deliver: hosts.deliver });

  // 9. WHEN WHAT THE APP CONSISTS OF CHANGES — a set of actions replaced, a
  // `refresh`, a move another process made — what this server derived from the
  // old manifest goes with it, and each living shell is brought level with
  // what its principal holds now, in place: no rebuild, no lost canvas state,
  // new actions become pushable, and one that left or is no longer granted is
  // unmounted. EVERY living shell: the ones the app's host keeps, the ones it
  // built for nobody signed in, and the ones each page's host built
  // (./hosts.ts, `adopt`). The manifest has already dropped what each set of
  // roles holds. A change that was refused never gets here.
  running.onChange(() => {
    // IDENTITY GOES WITH THEM. A change means something the resolutions were
    // derived FROM changed — an approval, a role, an artifact. Dropping the
    // compiled policies (the data module does, `buildRunningManifest`) while
    // keeping the records they were compiled from is keeping the stale half: a
    // promoted instructor would hold their old rung until the record expired
    // on its own clock.
    identity.invalidateAll();
    hosts.adopt();
  });

  // 10. THE FEATURES, started once the core stands and before anything is
  // served, in the order the app named them (`NiscApp.features`). Each mounts
  // its routes, registers what it reads and loads what it keeps, through the
  // seams (./features.ts) and nothing else; one that throws refuses the boot.
  // BEFORE the pointer is watched: a process that starts has changed nothing
  // for the others, so a set of actions a feature hands over while it starts
  // moves nobody's pointer. And before the operator prefix is mounted, because
  // a prefix's routes are taken when it is mounted (./routes.ts).
  const operator = operatorPrefix(runtime);
  await startFeatures(app.features ?? [], { app, runtime, server, operator, registered, identity, running, data });
  server.route('/operator', operator);
  // And the app's reactions hear a write (./reactions.ts), after the features: one
  // that hears writes too subscribed while it started, and is told first.
  subscribeReactions({ app, onWrite: data.onWrite, deliver: signals.deliver });

  // 11. From here on a change moves the generation pointer, so every other
  // process drops what it derived within one poll; and a move one of them
  // makes is answered here by reading again every set a feature keeps in
  // rows. A set an app handed to one process (`replaceActions`) with no
  // loader is not among those: it does not cross. Only now, so a boot that
  // refuses above leaves no timer polling behind it.
  running.watch();

  // 12. The socket (`buildSocket`, below).
  const socket = buildSocket({ runtime, session, identity, running, hosts });
  stops.push(socket.stop);

  // 13. The server: hono, and what `MossServer` adds to it (./moss-server.ts).
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
    // Every timer this server owns, stopped once. See the type for why this is
    // one call and not four. The list a boot that fails runs.
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

// WHAT THE APP CONSISTS OF RIGHT NOW (../manifest): what it shipped, and the
// sets of actions that arrive while it runs — an app's own, through
// `replaceActions`; a feature's, through the seams. Every surface asks it
// which actions are in force and what a set of roles holds of them, and it is
// the one place either changes.
//
// Creating it IS the boot check: an incoherent manifest refuses here, before
// anything else stands (the charter with each role's closure audited, every
// entry's reach, the layout variants).
export const buildRunningManifest = async (
  app: NiscApp,
  runtime: Pick<NiscRuntime, 'sessionRevalidateMs'>,
  data: Pick<Data, 'grants' | 'dropOnChange' | 'pointer' | 'seed'>,
): Promise<RunningManifest> => {
  const running = createRunningManifest({
    shipped: app,
    grants: data.grants,
    // Polled on the clock a socket's credential is re-verified on. The row
    // is the data module's: it is read and moved there, through vex, and the
    // manifest is handed those two functions and nothing of a database.
    pointer: { read: data.pointer.read, move: data.pointer.move, ...(runtime.sessionRevalidateMs !== undefined ? { everyMs: runtime.sessionRevalidateMs } : {}) },
  });
  // The policies were compiled from the manifest: they go when it changes.
  // Handed over here, because the manifest could not be built before the
  // grantable set was known.
  data.dropOnChange(running.onChange);
  // THE ENTRIES ARE THE RUNNING MANIFEST'S TO HAND OVER, for the same reason
  // and at the same moment: it is their source, and its list is copied here,
  // once, into the cache vex replays from. After the check above, so a
  // manifest that is refused has written no row. This line is the one place
  // the two holders of the entries meet: afterwards a replay resolves in the
  // cache, and the manifest is not asked.
  await data.seed(running.entries());
  return running;
};

// WHO A PRINCIPAL IS, for every surface (../identity). It is handed the app's
// three seams and the limits, and reaches rows only through `executeAs`: an
// identity entry is a seeded entry like any other.
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
    // A record goes stale on the clock a live socket's credential does.
    revalidateMs: runtime.sessionRevalidateMs ?? DEFAULT_REVALIDATE_MS,
  });

// THE SOCKET (../socket). It speaks for the same principals the HTTP surfaces
// serve — one session verifier, one catalog resolution, one version token.
// When the manifest declares a shell, server shells stand behind it: it is
// handed where a session comes from, for the app and for each page, and
// nothing else of a shell host.
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
    // How long a browser is told to keep the session cookie: known only where
    // the deployment keeps moss's own credential.
    ...(runtime.session === 'sessions' ? { sessionLastsMs: (token: string) => sessionRemainingMs(runtime.pool, token) } : {}),
  });
  // HOW THE SOCKET IS TO BE ATTACHED, said here and nowhere else. The two
  // settings of the transport are the deployment's, and the socket carries
  // them to whichever transport is handed it (./transport.ts): `serve`,
  // `nisc start` and the dev plugin all attach `server.socket`, and none of
  // them is handed the runtime or has to be.
  return Object.assign(socket, {
    transport: {
      ...(runtime.socketCompression !== undefined ? { compression: runtime.socketCompression } : {}),
      ...(runtime.socketMaxMessageBytes !== undefined ? { maxMessageBytes: runtime.socketMaxMessageBytes } : {}),
    },
  });
};
