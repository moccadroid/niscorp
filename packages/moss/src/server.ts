import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { VEX_LIVE_ENV } from '@niscorp/vex/hono';
import { wireFabric } from './fabric';
import type { VerifyReport } from '@niscorp/charter';
import { createRunningManifest, receiveManifest, refusalOf } from './manifest';
import type { Catalog, ManifestReport, NiscApp } from './manifest';
import type { ScopePolicy } from '@niscorp/vex';
import type { NiscRuntime } from './runtime';
import { createIdentity, sessionRemainingMs, sessionVerifierOf } from './identity';
import { createData, createWireFollower } from './data';
import type { ExecuteAs } from './data';
import { mintWrites } from './tide';
import type { ActionDefinition } from '@niscorp/nova';
import {
  buildContract,
  callIntegrationWith,
  createForwarder,
  relayed,
  contractAsMarkdown,
  copyPress,
  describePlacements,
  integrationByKey,
  filterInstalled,
  listIntegrations,
  loadIntegrationActions,
  frameAdmits,
  reachAdmits,
  reachDeclares,
  runIntake,
  intakeContextOf,
  PathBodySchema,
  RegisterBodySchema,
  approveIntegration,
  findIntegration,
  keepKeyHash,
  landBundle,
  recordFailedImport,
  removeIntegration,
  setBackToPending,
  standingOf,
} from './integrations';
import type { CallIntegration } from './integrations';
import { createAssertionSigner, hashIntegrationKey, mintIntegrationKey } from './integrations';
import { createSocket, DEFAULT_REVALIDATE_MS } from './socket';
import type { SocketAccept } from './socket';
import { createShellHost } from './shells';
import type { ShellHostContext } from './shells';
import { createPageRouter } from './pages';
import { shellNeedOf } from './liveness';
import type { IdentityRecord, IdentityReport, ResolvedIdentity } from './identity';
import type { ShellHost } from './shells';

// ═══════════════════════════════════════════════════════════════
// moss — the nisc app server: the data/policy plane over plain HTTP.
// Surfaces standing so far:
//
//   /catalog              — the application, resolved for the session's principal
//   /api/<resource>/vex   — reads and writes, locked, scoped per principal
//   /api/vex              — the cross-resource base surface
//
// The socket stands beside them (socket.ts); `/fns` — side-effect-free
// server functions behind plain URLs — is still unbuilt.
//
// The app hands over its ARTIFACTS (manifest/app.ts) and an environment
// (runtime/); everything mechanical is derived — the data layer and the
// policies (data/), what the app consists of right now and what each set of
// roles holds of it (manifest/) — and the server
// refuses to boot incoherent (DESIGN.md § Derivation over configuration:
// coherence is refused, not documented).
// ═══════════════════════════════════════════════════════════════

type Env = { Variables: { principal: string | null; resolved: ResolvedIdentity } };

// The composed app — hono (so a host mounts, extends or listens with any
// runtime adapter; it's the escape hatch for classic routing, too) plus
// the socket's accept, which the runtime's transport feeds new
// connections (see ./node's attachSocket).
export type MossServer = Hono<Env> & {
  socket: SocketAccept;
  shells?: ShellHost;
  // WHO A TOKEN IS — the deployment's own verifier, the one every surface here
  // already asks. For an app's own route that receives a credential some other
  // way than a Bearer header (a page request carries a cookie): null is a
  // refusal, exactly as it is everywhere else.
  principalOf: (token: string) => Promise<string | null>;
  // THE PAGE A PATH LEADS TO (manifest/app.ts § pages) — its name, the host that draws
  // it, and the input its path carries — or undefined for a path that is the
  // app's. The document route and the socket ask the same question here, so a
  // page is drawn and then served by one answer.
  page: (path: string) => { name: string; host: ShellHost; inputs: Record<string, Record<string, unknown>> } | undefined;
  // Every page the manifest declares, by name, with the path it is drawn at —
  // what a build walks to know which paths exist besides the app's own.
  pages: readonly { name: string; path: string }[];
  // Something the server derived its answers from changed where it cannot see
  // (a role, an install): verify what is in force again, drop every
  // per-principal memo, and have living shells adopt their re-resolved
  // definitions. It ships nothing: what the app consists of changes through
  // `replaceActions`, and the manifest it handed over cannot be edited.
  refresh: () => void;
  // HAND OVER A SET OF ACTIONS THAT ARRIVED WHILE THE APP RUNS — for an app
  // that loads actions from its own rows. `source` names the set: handing the
  // same name over again puts the new set in place of the old, so an action it
  // no longer names leaves. What the app would then consist of is verified
  // first. Refused, this throws with the sentence `refresh` throws and nothing
  // changed; accepted, it does what `refresh` does, and the set is frozen
  // where it stands: to change it, hand over another. The actions in force are
  // what the app shipped, then each set. `'integrations'` is moss's own set,
  // read from its integration tables.
  replaceActions: (source: string, actions: Record<string, ActionDefinition>) => void;
  // WOULD THAT SET BE TAKEN — the dry run of `replaceActions`: the same
  // verification over the same candidate, answered as a report, and nothing is
  // changed. `errors` empty: `replaceActions` would accept it. Otherwise each
  // error names the check that refuses (`charter`, `reach`, `variants`) and why.
  verifyActions: (source: string, actions: Record<string, ActionDefinition>) => ManifestReport;
  // THE ACTIONS IN FORCE NOW, by id: what the app shipped, then each set that
  // was handed over. To read, never to write: a set changes through
  // `replaceActions`.
  actions: () => Readonly<Record<string, ActionDefinition>>;
  // WHAT SOMEBODY HOLDS of the actions in force: the granted ids, sorted, and
  // the version token of that set (equal hash, equal application). `catalogOf`
  // resolves who the principal is the way a request does (`null` is nobody
  // signed in); `catalogForRoles` is for a caller that already knows the
  // roles, with the integrations installed where they stand (`undefined`:
  // every one is live).
  catalogOf: (principal: string | null) => Promise<Catalog>;
  catalogForRoles: (roles: readonly string[], installed?: readonly string[]) => Catalog;
  // WHAT A SET OF ROLES MAY READ AND WRITE: the vex policy a request by
  // somebody holding exactly these roles is served under, compiled from the
  // charter and the row behaviors over every table the database has. One
  // policy per role, merged. For a check or a tool that reads the rules: no
  // query runs, and the answer is compiled for the asking, so it is the
  // caller's own and not the one a request is served under.
  policyForRoles: (roles: readonly string[]) => ScopePolicy;
  // THE REPORT THIS SERVER WAS VERIFIED BY — `verifyCharter`'s, from boot, then
  // from each change that passed. Boot and refresh read its `errors` and
  // nothing else, so the rest was computed and dropped: the warnings (an action
  // no role grants, an allow that matches nothing) and each role's closure
  // issues. Nothing here prints them; a host that wants them reads them — over
  // the universes boot resolved against, which it cannot rebuild without the
  // database. `errors` is always empty: a report with one never got this far.
  charterReport: () => VerifyReport;
  // ONE PERSON'S identity, forgotten — for a change that concerns them and
  // nobody else (their role moved, their tenant installed an integration). `false` if
  // they were not held, which is an answer rather than an error. `refresh()`
  // above is the deployment-wide hammer; this is the scalpel, and a tenant-local
  // write should reach for it rather than dropping every principal's record.
  invalidateIdentity: (principal: string) => boolean;
  // The resolved record for one principal — the app reading back what its own
  // seam and entries produced, through the same cache the request path uses.
  // Not an enumerator: one principal in, one record out.
  identity: (principal: string | null) => Promise<IdentityRecord>;
  // Execute a seeded entry as a declared charter role — for surfaces that have
  // no principal by nature. In-process, replay-only, charter-bounded; see
  // ./data, execute-as.ts.
  executeAs: ExecuteAs;
  // Call an installed integration when nobody is driving — the outbound half
  // of `executeAs`. Resolves the row, refuses (throws) unless approved and
  // installed for this principal's tenant, mints the assertion, returns what
  // the integration answered — whatever it answered. Deliberately not gated
  // by reach: a lifecycle verb is not an action and has no screen; the
  // integration gates it itself, on the verified claims. The deployment's own
  // act, not a screen's. See integrations.ts, callIntegrationWith.
  callIntegration: CallIntegration;
  // FORGET ONE TENANT, not the deployment. The application tags each identity
  // record it resolves (`IdentityRecord.tag`); this drops every record wearing
  // one and answers how many it held. Moss never interprets the tag.
  //
  // This is what makes a tenant-local write tenant-local. `refresh()` is still
  // the right hammer for a changed ARTIFACT, because artifacts are deployment
  // -wide; a tenant installing an integration is not.
  invalidateTenant: (tag: string) => number;
  // WAKE ONE PRINCIPAL'S SHELL ON A CHANNEL — the outward, cross-process twin
  // of a reaction's `deliver`. The shell, wherever it is resident, is published
  // to payload-less so it re-reads under its own policy; the nudge crosses the
  // fabric so it lands in whichever process holds that principal. No fabric, no
  // second process: it is just the local `deliver`. Payload-less by the
  // row-less doctrine — a nudge says a channel changed, never what to.
  nudge: (principal: string, channel: string) => void;
  // The generation this process has observed. Moves when any process calls
  // `refresh`; every process drops its derivations within one poll of it.
  generation: () => number;
  // RETIRE EVERYTHING THIS SERVER STARTED that outlives a request — the
  // generation poll, the identity idle sweep, the socket's revalidation, the
  // shell idle sweep. ONE call, because the alternative is what leaked: a host
  // retiring a runtime IN-PROCESS (a dev floor rebuilding on a server-file
  // edit) had to enumerate moss's timers by reaching into each handle, and
  // could only ever stop the ones it could see — the poller and the identity
  // sweep were never surfaced, so a rebuild left them polling an ended pool.
  // The thing that started a timer owns stopping it; the host calls this and
  // learns nothing about how many there are. A deployment that boots ONCE
  // needs none of this: nothing retires it in-process, and every timer here is
  // `unref`'d, so the process carries them off on its own exit.
  close: () => void;
  // Every identity resident right now, and what the cache is costing —
  // structural facts only, on the shell-roster model. Absent when the app
  // declares no `identity` seam.
  identities?: { list: () => IdentityReport[]; meter: () => { size: number; max: number; resolved: number; evicted: number; expired: number } };
};

// Constant-time credential comparison. Both sides are hashed to a fixed 32-byte
// width first, so the compare never branches on length: a short guess is refused
// in the same time as a correct-length one (a bare length check would leak the
// key's length), and `timingSafeEqual` — which throws on a length mismatch — is
// always handed two equal-width digests. The timing signal a REMOTE attacker
// could read here is nanoseconds under microseconds of network jitter and is not
// the point; D6 co-locates add-on containers on a shared network, and the least
// -trusted code in the deployment facing far less jitter is.
export const secretsEqual = (a: string, b: string): boolean =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

// THE TWO GATES GUARDING THE OPERATOR PREFIX, installed in the order they must
// run. Registration order IS the security property: Hono composes matched
// handlers in the order they were added, so the app's gate has to be added
// before moss's key check to run before it, and both before the routes to wrap
// them. Without this, an app that mounted its own `/operator/*` middleware got a
// gate that ran AFTER moss's and, on moss's own routes, never — moss answered
// every refusal and the app's gate was unreachable on the one path that matters.
//
// The app's gate (if any) runs first: returning a Response refuses; calling
// `next()` and returning falls through to moss's key check. Either way moss's
// own check still runs on every path the gate lets through, so the seam can only
// HARDEN the prefix — add a second lock, never remove moss's. Awaiting `next()`
// lets the gate observe the OUTCOME (moss's own 404, an approval's 422), which
// is what makes auditing the consequential acts here honest rather than a log of
// attempts.
export const guardOperator = (operator: Hono<Env>, opts: { key: string; gate?: NiscRuntime['operatorGate'] }): void => {
  const gate = opts.gate;
  if (gate !== undefined) operator.use('*', (c, next) => Promise.resolve(gate(c, next)));
  operator.use('*', async (c, next) => {
    const presented = c.req.header('x-operator-key') ?? '';
    if (opts.key === '' || !secretsEqual(presented, opts.key)) return c.json({ message: 'Not found.' }, 404);
    return next();
  });
};

export const createServer = async (app: NiscApp, runtime: NiscRuntime): Promise<MossServer> => {
  // WHAT WAS HANDED OVER IS READ FIRST, AND THEN FROZEN (./manifest, the
  // hand-over): nothing below may meet a manifest no schema has read, and
  // nothing after may write one. One that does not parse refuses here, before
  // a table is created or a row is read.
  receiveManifest(app);

  // WHO A TOKEN IS, resolved before anything else boots: an unset verifier
  // refuses HERE, with a sentence, instead of serving every forged principal
  // silently (which is what the old `?? devSession` default did, for every
  // app that never set the field). 'dev-open' announces itself on this line.
  const session = sessionVerifierOf(runtime);

  // WHAT SOMEBODY MAY READ AND WRITE, for every surface below (./data). It runs
  // the tables' one ledgered run, brings the documents stored in them to this
  // code's grammars, and stands the engine up over what is there — in that
  // order, because a table created after the engine has looked is a table no
  // grant can reach. It is handed the database, the tables and the entries, the
  // charter and the row behaviors, and where a span goes; who a request is, it
  // is told for each request.
  const data = await createData({
    pool: runtime.pool,
    db: runtime.db,
    cache: runtime.cache,
    vexConfig: runtime.vexConfig,
    migrations: runtime.migrations,
    storesSessions: runtime.session === 'sessions',
    tables: runtime.tables,
    grammars: app.grammars,
    entries: app.entries,
    charter: app.charter,
    behaviors: app.behaviors,
    telemetry: runtime.telemetry,
  });
  const grammars = data.grammars;

  // WHAT THE APP CONSISTS OF RIGHT NOW (./manifest): what it shipped, and the
  // sets of actions that arrive while it runs — an approved integration's, read
  // from rows here; an app's own, through `replaceActions`. Every surface below
  // asks it which actions are in force and what a set of roles holds of them,
  // and it is the one place either changes.
  //
  // Creating it IS the boot check: an incoherent manifest refuses here, before
  // anything else stands (the charter with each role's closure audited, every
  // entry's reach, the layout variants).
  const storedIntegrationActions = (): Promise<Record<string, ActionDefinition>> => loadIntegrationActions(runtime.pool, grammars);
  const running = createRunningManifest({
    shipped: app,
    grants: data.grants,
    installedOnly: filterInstalled,
    loaders: { integrations: storedIntegrationActions },
    // Polled on the clock a socket's credential is re-verified on. (The
    // pointer's table is part of MOSS_SEQUENCE, applied with the rest above.)
    pointer: { pool: runtime.pool, ...(runtime.sessionRevalidateMs !== undefined ? { everyMs: runtime.sessionRevalidateMs } : {}) },
  });
  // The policies were compiled from the manifest: they go when it changes.
  // Handed over here, because the manifest could not be built before the
  // grantable set was known.
  data.dropOnChange(running.onChange);

  // WHO A PRINCIPAL IS, for every surface below (./identity). It is handed the
  // app's three seams and the limits, and reaches rows only through
  // `executeAs`: an identity entry is a seeded entry like any other.
  const identity = createIdentity({
    seam: app.identity,
    assignments: app.assignments,
    scope: app.scope,
    readAs: (role, fingerprint, scope) => data.executeAs(role, fingerprint, {}, scope),
    max: runtime.identityMax,
    idleMs: runtime.identityIdleMs,
    revalidateMs: runtime.sessionRevalidateMs ?? DEFAULT_REVALIDATE_MS,
  });

  // Approved integrations' actions, read from rows and handed to the running
  // manifest as its 'integrations' set. Called after an import, an approval
  // and a removal: the set is verified with everything else, and only then do
  // the memos drop and living shells adopt.
  const reloadIntegrations = async (): Promise<void> => running.replace('integrations', await storedIntegrationActions());

  // What a resolved principal holds (the manifest keeps it by roles + installs).
  const catalog = (resolved: ResolvedIdentity): Catalog => running.catalogFor(resolved.roles, resolved.installed);

  // THE DEPLOYMENT'S SIGNING IDENTITY — how an integration knows a call is
  // ours. Generated at boot, never persisted; the public half is served below
  // and verifying it is all anybody can do with it. See assert.ts for the
  // credential rule this and the integration key both follow.
  const assertions = createAssertionSigner(runtime.signingSeed);

  // THE ONE WAY OUT to an integration's service (./integrations, forward.ts):
  // found, approved, installed for whoever the call is for, and that said in
  // an assertion. The four doors below and the outbound call all go through
  // it.
  const forward = createForwarder({
    find: (id) => findIntegration(runtime.pool, id),
    who: (principal) => identity.resolve(principal),
    scopeOf: identity.scopeValuesFor,
    mint: assertions.mint,
  });
  const callIntegration = callIntegrationWith({ forward, ...(runtime.telemetry !== undefined ? { telemetry: runtime.telemetry } : {}) });

  // ── The surfaces ──
  const server = new Hono<Env>();

  // Identity, once, for every surface: Bearer token → principal. Absent
  // header → the anonymous principal (anonymity is a principal, not an
  // error). Invalid token → 401 (an explicit reject beats a silent
  // downgrade to anonymous).
  //
  // An INTEGRATION KEY is the second way in, routed by its prefix. It resolves
  // through the integrations table (hash match, approved only) to a principal
  // the APP names for whoever the key acts for — and from that line on nothing
  // downstream can tell it from a person: same policy compilation, same scope
  // values, same engine stamping its writes. Deleting the integration is what
  // revokes it; there is no second mechanism to forget.
  server.use('*', async (c, next) => {
    const header = c.req.header('Authorization');
    if (header === undefined) {
      c.set('principal', null);
      c.set('resolved', await identity.resolve(null));
      return next();
    }
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
    if (token.startsWith('ik_')) {
      const integration = await integrationByKey(runtime.pool, token);
      if (integration === undefined) {
        return c.json({ error: 'invalid_key', message: 'The integration key did not resolve.' }, 401);
      }
      const actor = (await app.integrationActor?.(integration, c.req.header('x-nisc-acts-for') ?? '')) ?? null;
      if (actor === null) {
        return c.json({ error: 'no_actor', message: 'This integration has no actor there.' }, 403);
      }
      // The seam may now be PURE (composing the actor id from its parts) —
      // whether the install is live is identity's question, so an actor that
      // resolves to nobody is refused here, where null used to be.
      const resolved = await identity.resolve(actor);
      if (resolved.roles.length === 1 && resolved.roles[0] === 'public') {
        return c.json({ error: 'no_actor', message: 'This integration has no actor there.' }, 403);
      }
      c.set('principal', actor);
      c.set('resolved', resolved);
      return next();
    }
    const principal = await session(token);
    if (principal === null) {
      return c.json({ error: 'invalid_token', message: 'The session token did not resolve to a principal.' }, 401);
    }
    c.set('principal', principal);
    // ONE resolution, here, for everything downstream. A token that verifies to
    // a principal the application cannot resolve is a 401 rather than a crash:
    // an unknown principal is a failed sign-in, not a server fault.
    try {
      c.set('resolved', await identity.resolve(principal));
    } catch {
      return c.json({ error: 'no_identity', message: 'The session token did not resolve to a principal.' }, 401);
    }
    return next();
  });

  // /catalog — the application, resolved for YOU.
  server.get('/catalog', (c) => {
    const principal = c.get('principal');
    const { ids, hash } = catalog(c.get('resolved'));
    return c.json({ principal, actions: ids, hash });
  });

  // WHAT HEARS A WRITE. Vex reports each committed mutation once, with
  // per-statement writes, and the data module hands it to whoever subscribed,
  // in this order of record:
  //
  //   1. The FACT lane — rows ride here and into tide's ledger only,
  //      stamped with the identity the app derives from the write's
  //      own scope. That stamp is the tenancy fence (see mintWrites).
  //   2. The REACTIONS — row-less by design and routed by declared
  //      interest: table, op, count, scope, with `deliver` to push
  //      onto living shells. A receiver that wants data re-reads it
  //      under its own policy.
  //
  // Late-bound throughout: shells and tide stand up after the mounts.
  const facts = app.facts;
  if (facts !== undefined) {
    data.onWrite((event, hints) => {
      const tide = facts.tide();
      const as = tide !== undefined ? facts.identity(event.scope) : undefined;
      if (tide === undefined || as === undefined) return;
      // The chain position the request named, if the app's gate takes that
      // caller's word for it.
      const chain = hints === undefined ? undefined : facts.chain?.(event.scope, hints);
      mintWrites(tide, event, as, Date.now(), chain).catch((err) => console.error('[moss:facts]', err));
    });
  }
  const reactions = app.reactions;
  if (reactions !== undefined) {
    data.onWrite((event) => {
      const tools = {
        // Local delivery carries the payload — an optimisation for a
        // shell resident in THIS process. The cross-process nudge is
        // payload-less: a shell in another process re-reads under its
        // own policy, which is the row-less doctrine and the only safe
        // thing to send off-box. No fabric → the publish is a no-op and
        // this is exactly today's local deliver.
        deliver: (principal: string, channel: string, payload?: unknown) => {
          const local = (server as MossServer).shells?.deliver(principal, channel, payload) ?? false;
          publishFabric({ kind: 'nudge', principal, channel });
          return local;
        },
      };
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
  }

  // The vex surfaces (./data, routes.ts) — the adapter does the work; the
  // server says WHO. Locked always; scope values and the compiled policy both
  // come from the principal, never from the request.
  server.route(
    '/',
    data.routes<Env>({
      resources: app.resources,
      // `userId` is always the principal; the app's `scope` hook contributes
      // whatever else a principal is (a tenant, an org). Merged server-side,
      // unforgeable by the request — a `to:` in a behavior resolves here.
      // The session's stable values, then the clock's. `scope` is applied
      // last and per request so a value derived from today's date cannot be
      // held for the life of a session that began yesterday.
      scope: (c) => identity.composeScope(c.get('principal'), c.get('resolved')),
      caller: (c) => c.get('resolved'),
    }),
  );

  // ── INTEGRATIONS ─────────────────────────────────────────────
  //
  // An integration announces; we fetch. There is no poll and no boot sweep:
  // `POST /api/integrations` IS the announcement, it is idempotent, and
  // re-importing after a deploy is the same call with the same body.
  // (The tables were created before the data layer stood up — see the top of
  // this function for why the order is load-bearing.)

  // Everything an integration is built against, in the two formats somebody
  // might want. With no shared code an author cannot import a component name or
  // a fingerprint constant — this is what replaces those imports.
  const contractFingerprints = async (principal: string | null): Promise<string[]> => {
    const discovery = await data.engine.cache.entries?.();
    if (discovery === undefined) return [];
    const compiled = data.policyOf(await identity.resolve(principal));
    return discovery
      .filter(({ entry }) => entry.kind === 'ok' || entry.kind === 'mutation')
      .map(({ key }) => key)
      .filter((key) => !key.startsWith('neg:'))
      .sort()
      .filter(() => compiled !== undefined);
  };

  server.get('/api/integrations/contract', async (c) => {
    const id = c.req.query('id') ?? '<your id>';
    const contract = buildContract(app, id);
    const fingerprints = await contractFingerprints(c.get('principal'));
    if (c.req.query('format') === 'md') {
      return new Response(contractAsMarkdown(contract, fingerprints), {
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      });
    }
    return c.json({ ...contract, fingerprints, verifyKey: assertions.verifyKey });
  });

  // The public half of the deployment's signing key — OPEN, because holding it
  // only verifies. An integration reads it once (an env var an operator sets,
  // or a fetch it caches) and every identity claim it will ever trust is
  // checked against it. One key serves every integration; there is no
  // per-integration outbound credential to store, paste, or rotate.
  server.get('/api/integrations/verify-key', (c) => c.json({ alg: 'ed25519', key: assertions.verifyKey }));

  // ── THE OPERATOR SEAM ────────────────────────────────────────
  //
  // Everything that decides WHICH integrations this deployment trusts. Keyed,
  // principal-less, and 404 without — a stranger who finds the path gets the
  // same answer as a stranger with a wrong key, which is nothing.
  //
  // What is deliberately NOT here: installing one for a studio. That is a
  // tenant decision made by somebody signed in, so it lives on the app's own
  // surfaces under the charter, where it can be audited against a person.
  const operator = new Hono<Env>();
  // The constant-time key check, plus the app's own gate over the whole prefix
  // if it supplied one (runtime.operatorGate). See guardOperator.
  guardOperator(operator, { key: runtime.operatorKey ?? '', gate: runtime.operatorGate });

  operator.get('/integrations', async (c) => c.json({ integrations: await listIntegrations(runtime.pool) }));

  // Register / announce / re-import — one verb.
  //
  // THE ORDER HERE IS THE WHOLE SAFETY STORY. Intake validates the payload, the
  // candidate action set is verified against the charter, and only then do rows
  // land. A bundle that would make the manifest incoherent is refused with a
  // sentence while the previous import keeps serving — because a bundle
  // committed before that check would take the app down until somebody deleted
  // rows by hand.
  operator.post('/integrations', async (c) => {
    const sent: unknown = await c.req.json().catch(() => ({}));
    const { id, url } = RegisterBodySchema.parse(sent);
    if (id === '' || url === '') return c.json({ message: 'Give an id and a url.' }, 400);

    let payload: unknown;
    try {
      const response = await fetch(`${url.replace(/\/$/, '')}/bundle`);
      if (!response.ok) throw new Error(String(response.status));
      payload = await response.json();
    } catch {
      await recordFailedImport(runtime.pool, id, url, 'the service did not answer with a bundle');
      return c.json({ message: 'The integration did not answer with a bundle.' }, 502);
    }

    const fingerprints = new Set((await data.engine.cache.keys?.()) ?? []);
    const result = runIntake(payload, { ...intakeContextOf(app, id, fingerprints, grammars), hostActions: running.actions() });
    if (!result.ok) {
      await recordFailedImport(runtime.pool, id, url, result.reasons.join('; '));
      return c.json({ message: 'Refused.', reasons: result.reasons }, 422);
    }

    // Press crosses HERE — after the gate, before the candidate below is
    // verified — so a press refusal leaves the app exactly as it
    // found it. Blobs written before a later refusal are orphans in the
    // host's store, which is cheaper than any coherence they could buy.
    const press = await copyPress(result.bundle, id, url, app.storePress);
    if (!press.ok) {
      await recordFailedImport(runtime.pool, id, url, press.reasons.join('; '));
      return c.json({ message: 'Refused.', reasons: press.reasons }, 422);
    }

    // The candidate manifest, verified BEFORE anything is written.
    const { approved: wasApproved, holdsKey } = await standingOf(runtime.pool, id);
    if (wasApproved) {
      // TRIED, NOT PUT IN. The bundle's actions over the actions in force are
      // a candidate the running manifest verifies without switching to it, so
      // a bundle that is refused never touched what is serving. (It used to be
      // assigned into the live manifest and taken out again when the check
      // threw: two drops of every memo and two moves of the pointer, to say
      // no.) The reason reads as the thrown error did.
      const refusal = refusalOf(running.verify({ ...running.actions(), ...result.bundle.actions }), 'refresh');
      if (refusal !== undefined) return c.json({ message: 'Refused — the app would not serve this.', reasons: [`Error: ${refusal}`] }, 422);
    }

    await landBundle(runtime.pool, {
      id,
      url,
      bundle: result.bundle,
      adds: describePlacements(result.bundle, app.placementNames ?? {}),
      press: press.urls,
      stamp: grammars.stamp,
    });

    // MINTED ONCE, SHOWN ONCE. Registration is a GRANTING ceremony — the
    // deployment issues the integration its identity, never the other way
    // around — so the first registration answers with the key and the row
    // keeps only the hash. A re-import repeats neither: the key is not stored,
    // so there is nothing to repeat. Losing it is not recovery, it is removal
    // and re-registration, which also re-fences everything the old key held.
    const key = holdsKey ? undefined : mintIntegrationKey();
    if (key !== undefined) {
      await keepKeyHash(runtime.pool, id, hashIntegrationKey(key));
    }

    await reloadIntegrations();
    const status = wasApproved ? 'approved' : 'pending';
    return c.json({ id, status, actions: Object.keys(result.bundle.actions).length, ...(key === undefined ? {} : { key }) });
  });

  // APPROVAL IS WHERE THE GRANTS BECOME REAL.
  //
  // Registration only records what an integration ASKED for. Nothing it ships
  // is served until somebody looks at the two lists side by side and says yes —
  // which is what keeps "the charter denies what it does not know" true while
  // still letting an integration name what it needs.
  //
  // Approving is also the moment its actions join the manifest, so this is the
  // second place the candidate set is verified before anything is served.
  operator.post('/integrations/:id/approve', async (c) => {
    const id = c.req.param('id');
    const requested = await approveIntegration(runtime.pool, id);
    if (requested === undefined) return c.json({ message: 'No such integration.' }, 404);
    try {
      await reloadIntegrations();
    } catch (err) {
      await setBackToPending(runtime.pool, id, String(err));
      await reloadIntegrations();
      return c.json({ message: 'Refused — the app would not serve this.', reasons: [String(err)] }, 422);
    }
    return c.json({ id, status: 'approved', granted: requested });
  });

  // Uninstalling for good: the rows go, the actions leave the manifest, and a
  // living shell adopts. What the integration stored stays with the integration
  // — which is why reinstalling restores it.
  operator.delete('/integrations/:id', async (c) => {
    const id = c.req.param('id');
    await removeIntegration(runtime.pool, id);
    await reloadIntegrations();
    return c.json({ id, removed: true });
  });

  // A LIVE CALL, because "the screen is empty" has three causes in three
  // systems and an operator should not have to guess which. This says what the
  // integration answered, right now, without a browser or a signed-in person.
  //
  // It probes what the integration DECLARED, plus `bundle` — which is the
  // answer to "the screen is empty" most of the time and is open by design
  // anyway. It used to take an operator-chosen arbitrary path, which made this
  // a second door into the integration's service beside the proxy, and one that minted
  // no assertion at all. An operator wanting a path the integration never declared is
  // asking a question about somebody else's service, not about this one.
  operator.post('/integrations/:id/probe', async (c) => {
    const id = c.req.param('id');
    const found = await findIntegration(runtime.pool, id);
    if (found === undefined) return c.json({ message: 'No such integration.' }, 404);
    const url = found.url;
    const sent: unknown = await c.req.json().catch(() => ({}));
    const path = PathBodySchema.parse(sent).path ?? 'bundle';
    // The declaration holds lyra-side paths (`/integrations/<id>/roster`); a
    // probe names the integration-side tail (`roster`), the same tail the proxy
    // forwards. One spelling to compare, derived rather than stored twice.
    if (path !== 'bundle' && !reachDeclares(found.reach, `/integrations/${id}/${path}`)) {
      return c.json({ message: 'That path is not one this integration declared.' }, 404);
    }
    const started = Date.now();
    try {
      const response = await fetch(`${url.replace(/\/$/, '')}/${path}`);
      const text = await response.text();
      return c.json({ status: response.status, ms: Date.now() - started, body: text.slice(0, 2000) });
    } catch (err) {
      return c.json({ status: 0, ms: Date.now() - started, body: String(err) });
    }
  });

  server.route('/operator', operator);

  // ── THE FRAME SEAM ───────────────────────────────────────────
  //
  // Lyra validates every layout against a fixed component vocabulary and
  // refuses a bundle naming anything else, which is what stops an untrusted
  // integration rendering arbitrary UI. That holds until a vendor's own browser SDK is
  // the only way to draw something — a payment onboarding form nobody else may
  // collect the fields for. The alternative to this seam is the HOST importing
  // that vendor's SDK, which is worse: it makes every app that ever installs
  // the integration carry the dependency.
  //
  // So the integration serves a page and the host frames it, at the host's own origin.
  //
  // AN IFRAME CARRIES NO AUTHORIZATION HEADER. The session token lives in
  // localStorage and `src=` is a plain browser GET, so the one thing every
  // other surface here relies on is exactly what this path cannot have. The
  // screen therefore asks for a GRANT over its own authenticated wire, and the
  // iframe spends it.
  //
  // THE GRANT IS OPAQUE AND LOCAL — deliberately NOT a signed assertion. It
  // travels in a URL, where things linger: history, logs, a Referer. Anything
  // this deployment's key signs is something an integration accepts as identity, so a
  // signed grant leaking from a URL bar would be an identity token leaking. A
  // random string in a Map cannot be replayed as anything; it is redeemed here,
  // and what crosses to the integration is a fresh assertion exactly like every other
  // call. Held in memory for the same reason the signing keypair is: it lives
  // two minutes, and a restart costs one reload.
  //
  // Reusable within its life rather than strictly once — a reload must not
  // break the screen somebody is halfway through.
  const grants = new Map<string, { integration: string; principal: string; path: string; expires: number }>();
  // LONG ENOUGH TO FINISH THE FORM. Two minutes was the first guess and it is
  // wrong for the thing this exists for: a payment onboarding form asks a
  // business for its details, and somebody goes and finds a document. Re-minting
  // mid-way is not an option either — the src changing remounts the frame and
  // takes the half-filled form with it.
  //
  // It stays cheap to hold: opaque, single-principal, single-path, redeemable
  // only at this origin, and gone on restart.
  const GRANT_TTL_MS = 30 * 60_000;
  const sweepGrants = (now: number): void => {
    for (const [token, grant] of grants) if (now >= grant.expires) grants.delete(token);
  };

  server.post('/api/integrations/frame', async (c) => {
    const principal = c.get('principal');
    if (principal === null) return c.json({ message: 'Sign in first.' }, 401);
    const sent: unknown = await c.req.json().catch(() => ({}));
    const path = PathBodySchema.parse(sent).path ?? '';
    const id = path.split('/')[2] ?? '';
    const found = await findIntegration(runtime.pool, id);
    if (found === undefined || found.status !== 'approved') return c.json({ message: 'No such integration.' }, 404);
    const resolved = await identity.resolve(principal);
    if (resolved.installed !== undefined && !resolved.installed.includes(id)) return c.json({ message: 'Not installed here.' }, 404);
    // THE DECLARATION IS THE PERIMETER HERE TOO. A grant is only ever minted
    // for a page the bundle named at intake, so a screen cannot frame a path
    // the integration never published — including one it serves but did not declare.
    //
    // AND FOR THE SCREEN THAT OWNS IT. This door had the same hole the proxy
    // did, and a worse one to have: `frames` was a bare list of paths with no
    // owner at all, so the only questions askable were "signed in?" and
    // "installed here?". A member of the gym passed both and could be served the
    // page that mounts a payment provider's onboarding form against the
    // studio's merchant account. The bundle names the owning action now, and a
    // grant is minted only for somebody who holds it.
    const held = new Set(catalog(resolved).ids);
    if (!frameAdmits(found.frames, path, held)) return c.json({ message: 'No such frame.' }, 404);

    const now = Date.now();
    sweepGrants(now);
    const token = randomBytes(24).toString('hex');
    grants.set(token, { integration: id, principal, path, expires: now + GRANT_TTL_MS });
    return c.json({ src: `/integrations/${id}/frame/${token}`, expiresIn: GRANT_TTL_MS });
  });

  // Redeeming: a document GET, no session, one token. Registered before the
  // proxy so `/integrations/:id/*` does not match first and demand a principal.
  server.get('/integrations/:id/frame/:token', async (c) => {
    const id = c.req.param('id');
    const now = Date.now();
    sweepGrants(now);
    const grant = grants.get(c.req.param('token'));
    // One answer for expired, unknown, and minted-for-another-integration. A grant is
    // a URL somebody may still have; what it opens is nothing.
    if (grant === undefined || grant.integration !== id || now >= grant.expires) {
      return c.json({ message: 'Not found.' }, 404);
    }
    // Re-checked at REDEEM, not just at mint: an uninstall between the two is
    // exactly the moment a stale tab must stop working.
    const ended = await forward({
      integration: id,
      principal: grant.principal,
      path: grant.path.split('/').slice(3).join('/'),
      request: (assertion) => ({ headers: { authorization: `Bearer ${assertion}` } }),
    });
    if (ended.kind === 'refused') return c.json({ message: 'Not found.' }, 404);
    if (ended.kind === 'unreachable') return c.json({ message: 'The integration is unreachable.' }, 502);
    // THE INTEGRATION'S OWN CONTENT TYPE TRAVELS. A framed page is HTML; forcing
    // `application/json` the way the proxy below used to would hand the
    // browser a document it will not render.
    return relayed(ended.response, 'text/html; charset=utf-8');
  });

  // A FRAMED PAGE CALLING BACK ON ITS OWN GRANT.
  //
  // The page is sandboxed without `allow-same-origin` (lyra's Frame component),
  // so it has an opaque origin and no session — it cannot call the proxy, and it
  // has nothing to authenticate with but the grant it was opened by. Without
  // this it is a dead-end document, which is not enough for the thing frames
  // exist for: a vendor's embedded component asks the server for a fresh
  // short-lived session while somebody is mid-form.
  //
  // BOUNDED TO ONE SEGMENT BESIDE THE DECLARED PAGE. `embed/onboarding` may call
  // `embed/session` and nothing else — no slashes, no dots, no climbing. The
  // grant already fixes which integration, which principal and which page; this fixes
  // how far a page may reach from where it was let in.
  const CALLBACK = /^[a-z0-9][a-z0-9-]*$/;

  server.post('/integrations/:id/frame/:token/:call', async (c) => {
    const id = c.req.param('id');
    const call = c.req.param('call');
    const now = Date.now();
    sweepGrants(now);
    const grant = grants.get(c.req.param('token'));
    if (grant === undefined || grant.integration !== id || now >= grant.expires) return c.json({ message: 'Not found.' }, 404);
    if (!CALLBACK.test(call)) return c.json({ message: 'Not found.' }, 404);

    // Beside the page, never above it: the declared frame's own directory.
    const rest = grant.path.split('/').slice(3);
    rest.pop();
    const ended = await forward({
      integration: id,
      principal: grant.principal,
      path: [...rest, call].join('/'),
      request: async (assertion) => ({
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${assertion}` },
        body: await c.req.text(),
      }),
    });
    if (ended.kind === 'refused') return c.json({ message: 'Not found.' }, 404);
    if (ended.kind === 'unreachable') return c.json({ message: 'The integration is unreachable.' }, 502);
    // THE CALLER IS AN OPAQUE ORIGIN, and that is deliberate: the framed
    // page is sandboxed WITHOUT `allow-same-origin` so it cannot reach
    // this app's storage or session. The cost is that its `Origin` is
    // literally `null`, and a browser refuses the response without a
    // matching allowance — which is what a vendor's embedded component
    // hits the moment it asks for a fresh session.
    //
    // CORS IS NOT THE FENCE HERE, so opening it costs nothing. The
    // credential is the unguessable, short-lived, single-path grant in the
    // URL; anybody holding it can call this from a server where CORS does
    // not apply at all. Refusing the browser only breaks the one caller
    // this route exists for.
    return relayed(ended.response, 'application/json', { 'access-control-allow-origin': 'null', vary: 'origin' });
  });

  // ── THE WEBHOOK DOOR ─────────────────────────────────────────
  //
  // The only unauthenticated surface on this server that DOES something, and it
  // is narrow on purpose.
  //
  // A vendor calling in has no session and no key — it could not have one, since
  // nobody is driving. So identity does not travel here at all: no principal is
  // required and NO ASSERTION IS MINTED. The integration authenticates the
  // caller itself, against the vendor's own signature, which is the only party
  // that can vouch for a call moss cannot.
  //
  // THE BODY ARRIVES BYTE-IDENTICAL. A signature is computed over exact bytes,
  // and a JSON round-trip through this process would re-order one key and break
  // every verification downstream. Nothing on this path parses the body — it is
  // read as an ArrayBuffer and handed on.
  //
  // Registered BEFORE the proxy below, because `server.all('/integrations/:id/*')`
  // would otherwise match first and demand a principal.
  //
  // A DOOR WE DID NOT LOCK NEEDS A LIMIT. Every other surface is bounded by a
  // credential; this one is bounded by the vendor behaving. In-process and per
  // integration, so a deployment on two machines gets two ceilings — the honest
  // cost of not putting a shared store behind this yet.
  const hookHits = new Map<string, { count: number; resets: number }>();
  const HOOK_LIMIT = 240;
  const HOOK_WINDOW_MS = 60_000;
  const hookAllows = (id: string, now: number): boolean => {
    const seen = hookHits.get(id);
    if (seen === undefined || now >= seen.resets) {
      hookHits.set(id, { count: 1, resets: now + HOOK_WINDOW_MS });
      return true;
    }
    seen.count += 1;
    return seen.count <= HOOK_LIMIT;
  };

  server.post('/integrations/:id/hook/*', async (c) => {
    const id = c.req.param('id');
    const here = new URL(c.req.url);
    // Every header the vendor set travels, because the signature is in one of
    // them and moss does not know which. `authorization` is dropped: this path
    // mints no identity, and a bearer arriving here must not read as one on the
    // other side. `host` would name us rather than them.
    const headers = new Headers(c.req.raw.headers);
    headers.delete('authorization');
    headers.delete('host');
    const ended = await forward({
      integration: id,
      admits: () => hookAllows(id, Date.now()),
      path: `${here.pathname.split('/').slice(3).join('/')}${here.search}`,
      request: async () => ({ method: 'POST', headers, body: await c.req.arrayBuffer() }),
    });
    if (ended.kind === 'refused') {
      // 404 for "no such integration" AND for "not approved yet" — the same
      // answer, so a stranger probing this learns nothing about which integrations a
      // deployment is currently considering.
      return ended.why === 'inadmissible' ? c.json({ message: 'Too many.' }, 429) : c.json({ message: 'Not found.' }, 404);
    }
    // A vendor reads 502 as "retry me", which is what we want: the delivery
    // is not lost, it is deferred until the integration is back.
    if (ended.kind === 'unreachable') return c.json({ message: 'The integration is unreachable.' }, 502);
    return relayed(ended.response, 'application/json');
  });

  // THE PROXY.
  //
  // Identity travels INSIDE a signed assertion, never as bare headers. The
  // token carries the integration it is for, the principal, the same scope
  // values the resolver gives vex for `$scope`, and an expiry seconds out —
  // signed with the deployment's key, whose public half the integration holds.
  // A claim outside a verified envelope is not refused over there; it simply
  // is not identity, which is what makes the safe path the only path. The
  // body stays caller-controlled and untrusted, exactly as a vex `$context`
  // is: an integration reading `studio_id` from the body has reintroduced the
  // hole whatever we sign.
  server.all('/integrations/:id/*', async (c) => {
    const principal = c.get('principal');
    if (principal === null) return c.json({ message: 'Sign in first.' }, 401);
    const id = c.req.param('id');
    // The QUERY TRAVELS. `c.req.path` drops it, so an endpoint declared with
    // `?view=summary` arrived at the integration without it — the integration answered a
    // different question than the screen asked, and nothing said so.
    const here = new URL(c.req.url);
    const ended = await forward({
      integration: id,
      principal,
      // THE DECLARATION IS THE PERIMETER (./integrations, reach.ts). Before this,
      // being signed in at a studio that installed an integration was permission to call
      // ANY path the integration's service happened to serve — its internals, its
      // admin verbs, whatever it grew next release. Now it is permission to call
      // the paths the integration declared, and nothing is forwarded for the rest.
      //
      // AND ONLY THE ONES THIS CALLER'S OWN SCREENS DECLARE. The path check alone
      // was half the fence: reach is the union over every action in the bundle, so
      // a member at a studio with payments installed reached the merchant
      // onboarding endpoint — the charter's `ext.desk.*` fence decided which
      // SCREENS rendered and nothing about which endpoints answered. The catalog
      // is the same one the shell is built from, so a door and the screen that
      // opens it can no longer disagree.
      //
      // Checked BEFORE the assertion is minted: an inadmissible path gets no
      // credential, not even one that would have died at the other end.
      admits: (found, caller) => reachAdmits(found.reach, c.req.path, new Set(running.catalogFor(caller.roles, caller.installed).ids)),
      path: `${here.pathname.split('/').slice(3).join('/')}${here.search}`,
      request: async (assertion) => ({
        method: c.req.method,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${assertion}` },
        ...(c.req.method === 'GET' ? {} : { body: await c.req.text() }),
      }),
    });
    // 404 rather than 403 for every refusal: what somebody may not reach, they
    // do not learn the existence of.
    if (ended.kind === 'refused') return c.json({ message: ended.why === 'uninstalled' ? 'Not installed here.' : 'No such integration.' }, 404);
    // An integration that is down is an ordinary condition: the action's
    // onError shows the sentence and nothing is claimed.
    if (ended.kind === 'unreachable') return c.json({ message: 'The integration is unreachable.' }, 502);
    // What the integration answered WITH, not what we assumed it answered with.
    return relayed(ended.response, 'application/json');
  });

  // The socket speaks for the same principals the HTTP surfaces serve —
  // one session verifier, one catalog resolution, one version token. When
  // the manifest declares a shell, server shells stand behind it: their
  // endpoint calls ride the server's OWN surfaces with the session's token
  // (same wire, same enforcement — the shell is just another client).
  //
  // ONE CONTEXT, for the app's host and for every page's: who a principal is,
  // the governed wire and the environment are the same wherever a shell is
  // built. What differs is the manifest it is built from and whether it is kept.
  const shellContext: ShellHostContext = {
        app,
        actions: running.actions,
        needOf: (definition) => shellNeedOf(definition, running.entries),
        // ONE resolution per shell build, awaited. This was four synchronous
        // questions, and every one of them was ultimately answered out of a
        // resident map of the population.
        resolve: async (principal) => {
          const resolved = await identity.resolve(principal);
          // THE INSTALL LIST IS RE-READ AT BUILD. A shell is the long-lived
          // thing here: an identity record may have been resolved before the
          // tenant installed an integration, and a shell built from it would be missing
          // that integration's screens for the life of the session. Once per shell,
          // not once per request — the seam this consults is synchronous and
          // cheap, and it is the same one `adopt` re-reads for the same reason.
          // The record IS the install list now — resolved through the same
          // engine entries as everything else, revalidated on the identity
          // cache's own clock.
          return { roles: resolved.roles, scope: resolved.scope, installed: resolved.installed, catalog: catalog(resolved), variants: running.variantsFor(resolved.roles), policy: data.policyOf(resolved) };
        },
        catalogFor: running.catalogFor,
        variantsFor: running.variantsFor,
        runtime,
        ...(runtime.shellIdleMs !== undefined ? { idleMs: runtime.shellIdleMs } : {}),
        ...(runtime.shellFrameDelta !== undefined ? { delta: runtime.shellFrameDelta } : {}),
        wire: (token) => async (url, init) => {
          const isVex = url.split('?')[0]?.endsWith('/vex') === true;
          // A vex read made for a caller that can be told when to stop — a
          // nova endpoint passes its instance's signal — may keep answering
          // (`refresh: 'reactive'`; see ./data, follow.ts). The follower rides the
          // in-process request's env, where no network request can put one.
          const follower = isVex && init?.signal !== undefined ? createWireFollower(init.signal) : undefined;
          const res = await server.request(
            url,
            {
              method: init?.method ?? 'GET',
              headers: { ...(init?.headers ?? {}), ...(token !== null ? { Authorization: `Bearer ${token}` } : {}) },
              ...(init?.body !== undefined ? { body: init.body } : {}),
            },
            follower === undefined ? undefined : { [VEX_LIVE_ENV]: follower.live },
          );
          // Vex replies `{ result, meta }`; endpoints want the data — the
          // same unwrap the client wire applies, so an action behaves
          // identically under either shell.
          if (!isVex || !res.ok) {
            follower?.end();
            return res;
          }
          const body = (await res.json()) as Record<string, unknown> | null;
          const result = body !== null && typeof body === 'object' && 'result' in body ? body['result'] : body;
          follower?.handedOver();
          return {
            ok: res.ok,
            status: res.status,
            json: () => Promise.resolve(result),
            text: () => Promise.resolve(JSON.stringify(result)),
            ...(follower === undefined ? {} : { onChange: follower.onChange }),
          };
        },
  };
  const shells = app.shell !== undefined ? createShellHost(shellContext) : undefined;

  // PAGES: a host each, built from the page's own manifest and keeping nothing
  // (manifest/app.ts § pages). The router refuses two pages that could answer one path,
  // here, at boot — like every other incoherence.
  const pageManifests = app.pages ?? {};
  const pageRouter = createPageRouter(pageManifests);
  const pageHosts = new Map(Object.entries(pageManifests).map(([name, manifest]) => [name, createShellHost({ ...shellContext, manifest, kept: false })]));
  const pageAt = (path: string): { name: string; host: ShellHost; inputs: Record<string, Record<string, unknown>> } | undefined => {
    const matched = pageRouter.match(path);
    if (matched === undefined) return undefined;
    const host = pageHosts.get(matched.name);
    const manifest = pageManifests[matched.name];
    if (host === undefined || manifest === undefined) return undefined;
    return { name: matched.name, host, inputs: manifest.params === undefined ? {} : { [manifest.params]: matched.params } };
  };

  // THE CLUSTER FABRIC. One origin per process, stamped on every signal so a
  // process ignores its own echoes. The three appliers below are LOCAL-ONLY —
  // they mutate what this process holds and never publish — and are shared by
  // two callers: a remote signal (through `wireFabric`'s subscriber) and this
  // server's own methods, which run the applier THEN publish. Absent a fabric,
  // `publishFabric` is a no-op and nothing is subscribed. `refresh` is
  // deliberately not here: it rides the generation pointer, which is persistent
  // and survives a restart, because the manifest it guards has no other heal
  // clock (fabric.ts, manifest/generation.ts).
  const fabricOrigin = randomBytes(8).toString('hex');
  const applyInvalidateIdentity = (principal: string): boolean => {
    const held = identity.invalidate(principal);
    shells?.reset(principal);
    return held;
  };
  const applyInvalidateTenant = (tag: string): number => identity.invalidateTag(tag).length;
  // Wake one principal's shell, payload-less — the shell re-reads. If that
  // principal is resident here it wakes; if not, this is a no-op and the process
  // that holds them applies the same signal. No tag lookup: `deliver` is
  // per-principal, and the identity cache is deliberately not a by-tenant index.
  const applyNudge = (principal: string, channel: string): void => {
    shells?.deliver(principal, channel);
  };
  const publishFabric = wireFabric(runtime.fabric, fabricOrigin, {
    invalidateIdentity: applyInvalidateIdentity,
    invalidateTenant: applyInvalidateTenant,
    nudge: applyNudge,
  });

  // WHEN WHAT THE APP CONSISTS OF CHANGES — a set of actions replaced, a
  // `refresh`, a move another process made — what this server derived from the
  // old manifest goes with it, and living shells adopt their re-resolved
  // definitions in place: no rebuild, no lost canvas state, new actions simply
  // become pushable. The manifest has already dropped what each set of roles
  // holds. A change that was refused never gets here.
  running.onChange(() => {
    // IDENTITY GOES WITH THEM. A change means something the resolutions were
    // derived FROM changed — an approval, a role, an artifact. Dropping the
    // compiled policies (the data module does, see above) while keeping the
    // records they were compiled from is keeping the stale half: a promoted
    // instructor would hold their old rung until the record expired on its own
    // clock.
    identity.invalidateAll();
    shells?.adopt();
  });

  // WHATEVER WAS APPROVED BEFORE THIS PROCESS STARTED is part of the
  // application, so it is folded in before anything is served — not on first
  // request and not on a timer. And BEFORE the pointer is watched: a process
  // that starts has changed nothing for the others, so its start moves nobody's
  // pointer.
  {
    const stored = await storedIntegrationActions();
    if (Object.keys(stored).length > 0) running.replace('integrations', stored);
  }

  // From here on a change moves the generation pointer, so every other process
  // drops what it derived within one poll; and a move one of them makes is
  // answered here by reading the integration actions again. Only now, so a
  // boot that refuses above leaves no timer polling behind it.
  running.watch();

  // Held in a local, not inlined below, because `close` has to reach its
  // `stop` — the socket's revalidation timer is one of the four this server
  // retires.
  const socket = createSocket({
    session,
    catalog: async (principal) => catalog(await identity.resolve(principal)),
    ...(shells !== undefined ? { shells } : {}),
    page: pageAt,
    ...(runtime.sessionRevalidateMs !== undefined ? { revalidateMs: runtime.sessionRevalidateMs } : {}),
    ...(runtime.telemetry !== undefined ? { telemetry: runtime.telemetry } : {}),
    ...(runtime.origins !== undefined ? { origins: runtime.origins } : {}),
    ...(runtime.session === 'sessions' ? { sessionLastsMs: (token: string) => sessionRemainingMs(runtime.pool, token) } : {}),
  });

  return Object.assign(server, {
    socket,
    principalOf: async (token: string) => session(token),
    page: pageAt,
    pages: Object.entries(pageManifests).map(([name, manifest]) => ({ name, path: manifest.path })),
    ...(shells !== undefined ? { shells } : {}),
    refresh: running.refresh,
    replaceActions: running.replace,
    verifyActions: running.verifyReplace,
    actions: running.actions,
    catalogOf: async (principal: string | null) => catalog(await identity.resolve(principal)),
    catalogForRoles: (roles: readonly string[], installed?: readonly string[]) => running.catalogFor(roles, installed),
    policyForRoles: data.policyForRoles,
    charterReport: () => running.report().charter,
    generation: running.generation,
    // Every timer this server owns, stopped once. Absent pieces (an app with no
    // identity seam, no shells) simply have nothing to stop — the `?.` is the
    // whole guard. See the type above for why this is one call and not four.
    close: () => {
      running.stop();
      identity.stop();
      socket.stop();
      shells?.stop();
      for (const host of pageHosts.values()) host.stop();
    },
    executeAs: data.executeAs,
    callIntegration,
    identity: async (principal: string | null) => {
      const resolved = await identity.resolve(principal);
      return { roles: resolved.roles, scope: resolved.scope, ...(resolved.installed !== undefined ? { installed: resolved.installed } : {}) };
    },
    invalidateTenant: (tag: string) => {
      // FORGETS, AND DOES NOT RESET.
      //
      // Resetting throws a shell away and builds its replacement, which is
      // right for a ROLE change — the landing surface and the nav were seeded
      // from the old rung — and wrong here. A tenant installing an integration changes
      // what its people may REACH, not who they are, and `adopt` (called by
      // `refresh` alongside this) re-resolves every live shell and registers
      // the new definitions in place. Resetting as well would discard whatever
      // anybody at that studio was in the middle of, to arrive at the same
      // screen.
      //
      // A caller who does mean "rebuild theirs" has `invalidateIdentity`, which
      // is what a role change uses.
      //
      // Applied locally, then published: a second process forgets the same
      // tenant's records, and its live shells pick up the changed actions
      // through the generation pointer's own adopt — the fabric carries the
      // record-forget, generation carries the manifest.
      const forgotten = applyInvalidateTenant(tag);
      publishFabric({ kind: 'invalidate-tenant', tag });
      return forgotten;
    },
    invalidateIdentity: (principal: string) => {
      // The compiled memos are keyed by (roles + installed), not by principal,
      // so they need no clearing here: a re-resolved record either lands on the
      // same key — in which case the memo was already right — or on a different
      // one, which was never this principal's to begin with.
      //
      // Applied locally, then published: the process where this principal's
      // shell is resident resets it, whichever process that is.
      const held = applyInvalidateIdentity(principal);
      publishFabric({ kind: 'invalidate-identity', principal });
      return held;
    },
    nudge: (principal: string, channel: string) => {
      applyNudge(principal, channel);
      publishFabric({ kind: 'nudge', principal, channel });
    },
    ...(identity.roster !== undefined ? { identities: identity.roster } : {}),
  });
};
