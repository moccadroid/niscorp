import { Hono } from 'hono';
import { sessionRevokerOf, sessionVerifierOf } from '../identity';
import { receiveManifest } from '../manifest';
import type { NiscApp } from '../manifest';
import type { NiscRuntime } from '../runtime';
import { standData } from './data';
import { emptyRegister, seamsOf, wrappedBy } from './features';
import { standHosts } from './hosts';
import { standIdentity } from './identity';
import { hearWrites } from './lanes';
import { standManifest } from './manifest';
import type { Env, MossServer } from './moss-server';
import { operatorPrefix } from './operator';
import { mountRoutes } from './routes';
import { standSignals } from './signals';
import { standSocket } from './socket';
import { wireOver } from './wire';

// ═══════════════════════════════════════════════════════════════
// createServer — the wiring, and nothing else.
//
// The app hands over its ARTIFACTS (../manifest) and an environment
// (../runtime); everything mechanical is derived by the module that owns it.
// This function constructs the modules, hands each the narrow things it
// needs, starts the features and mounts the routes. It answers no question of
// its own: each step below is one line here and a file beside this one.
//
// The server refuses to boot incoherent (DESIGN.md § Derivation over
// configuration: coherence is refused, not documented), and each refusal is
// the step's that finds it.
// ═══════════════════════════════════════════════════════════════

export const createServer = async (app: NiscApp, runtime: NiscRuntime): Promise<MossServer> => {
  // 1. WHAT WAS HANDED OVER IS READ FIRST, AND THEN FROZEN (../manifest, the
  // hand-over): nothing below may meet a manifest no schema has read, and
  // nothing after may write one. One that does not parse refuses here, before
  // a table is created or a row is read.
  receiveManifest(app);

  // 2. WHO A TOKEN IS, resolved before anything else boots: an unset verifier
  // refuses HERE, with a sentence, instead of serving every forged principal
  // silently (which is what the old `?? devSession` default did, for every
  // app that never set the field). 'dev-open' announces itself on this line.
  // And how every session a principal holds is forgotten at a sign-out, where
  // the deployment keeps the credential itself.
  const session = sessionVerifierOf(runtime);
  const revokeSessions = sessionRevokerOf(runtime);

  // 3. The tables are migrated and `data` stands (./data.ts).
  const data = await standData(app, runtime);

  // 4. The running manifest: creating it is the boot check (./manifest.ts).
  const running = standManifest(app, runtime, data);

  // 5. Identity (./identity.ts).
  const identity = standIdentity(app, runtime, data);

  // 6. The server's own surfaces (./routes.ts): the authentication, the
  // catalog and vex. `registered` is what a feature adds to them when it
  // starts: a credential the authentication reads, a wrap around the wire.
  const server = new Hono<Env>();
  const registered = emptyRegister();
  mountRoutes(server, { app, session, credentials: registered.credentials, identity, running, data });

  // 7. The shell hosts, the app's and each page's (./hosts.ts). Their
  // endpoint calls ride the server's OWN surfaces with the session's token
  // (./wire.ts): same wire, same enforcement.
  const hosts = standHosts({ app, runtime, identity, running, data, wire: wireOver(server), wrapWire: wrappedBy(registered), revokeSessions });

  // 8. What crosses processes (./signals.ts).
  const signals = standSignals({ fabric: runtime.fabric, identity, shells: hosts.shells });

  // 9. WHEN WHAT THE APP CONSISTS OF CHANGES — a set of actions replaced, a
  // `refresh`, a move another process made — what this server derived from the
  // old manifest goes with it, and each living shell is brought level with
  // what its principal holds now, in place: no rebuild, no lost canvas state,
  // new actions become pushable, and one that left or is no longer granted is
  // unmounted. The manifest has already dropped what each set of roles holds.
  // A change that was refused never gets here.
  running.onChange(() => {
    // IDENTITY GOES WITH THEM. A change means something the resolutions were
    // derived FROM changed — an approval, a role, an artifact. Dropping the
    // compiled policies (the data module does, ./manifest.ts) while keeping the
    // records they were compiled from is keeping the stale half: a promoted
    // instructor would hold their old rung until the record expired on its own
    // clock.
    identity.invalidateAll();
    hosts.shells?.adopt();
  });

  // 10. THE FEATURES, started once the core stands and before anything is
  // served, in the order the app named them (`NiscApp.features`). Each mounts
  // its routes, registers what it reads and loads what it keeps, through the
  // seams (./features.ts) and nothing else; one that throws refuses the boot.
  // BEFORE the pointer is watched: a process that starts has changed nothing
  // for the others, so a set of actions a feature hands over while it starts
  // moves nobody's pointer. And before the operator prefix is mounted, because
  // a prefix's routes are taken when it is mounted (./operator.ts).
  const operator = operatorPrefix(runtime);
  const seams = seamsOf({ app, runtime, server, operator, registered, identity, running, data });
  for (const feature of app.features ?? []) await feature.start(seams);
  server.route('/operator', operator);
  // And the app's reactions hear a write (./lanes.ts), after the features: one
  // that hears writes too subscribed while it started, and is told first.
  hearWrites({ app, onWrite: data.onWrite, deliver: signals.deliver });

  // 11. From here on a change moves the generation pointer, so every other
  // process drops what it derived within one poll; and a move one of them
  // makes is answered here by reading again every set a feature keeps in
  // rows. Only now, so a boot that refuses above leaves no timer polling
  // behind it.
  running.watch();

  // 12. The socket (./socket.ts).
  const socket = standSocket({ runtime, session, identity, running, hosts });

  // 13. The server: hono, and what `MossServer` adds to it (./moss-server.ts).
  return Object.assign(server, {
    socket,
    principalOf: async (token: string) => session(token),
    page: hosts.pageAt,
    pages: hosts.pages,
    ...(hosts.shells !== undefined ? { shells: hosts.shells } : {}),
    refresh: running.refresh,
    replaceActions: running.replace,
    verifyActions: running.verifyReplace,
    actions: running.actions,
    catalogOf: async (principal: string | null) => {
      const resolved = await identity.resolve(principal);
      return running.catalogFor(resolved.roles, resolved.installed);
    },
    catalogForRoles: (roles: readonly string[], installed?: readonly string[]) => running.catalogFor(roles, installed),
    policyForRoles: data.policyForRoles,
    charterReport: () => running.report().charter,
    generation: running.generation,
    // Every timer this server owns, stopped once. See the type for why this is
    // one call and not four.
    close: () => {
      running.stop();
      identity.stop();
      socket.stop();
      hosts.stop();
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
