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
import { createData, createWireFollower, featureTablesOf } from './data';
import type { ExecuteAs } from './data';
import { mintWrites } from './tide';
import type { ActionDefinition, FetchFn } from '@niscorp/nova';
import type { CredentialAnswer, FeatureSeams } from './feature';
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
  // what the app shipped, then each set. `'integrations'` is taken: the
  // integrations feature hands the approved integrations' actions over under
  // that name, read from its tables.
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
    // The tables the features keep, so they are there before a feature starts.
    featureTables: featureTablesOf(app),
    tables: runtime.tables,
    grammars: app.grammars,
    entries: app.entries,
    charter: app.charter,
    behaviors: app.behaviors,
    telemetry: runtime.telemetry,
  });

  // WHAT THE APP CONSISTS OF RIGHT NOW (./manifest): what it shipped, and the
  // sets of actions that arrive while it runs — an app's own, through
  // `replaceActions`; a feature's, through the seams below. Every surface
  // asks it which actions are in force and what a set of roles holds of them,
  // and it is the one place either changes.
  //
  // Creating it IS the boot check: an incoherent manifest refuses here, before
  // anything else stands (the charter with each role's closure audited, every
  // entry's reach, the layout variants).
  const running = createRunningManifest({
    shipped: app,
    grants: data.grants,
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

  // What a resolved principal holds (the manifest keeps it by roles + installs).
  const catalog = (resolved: ResolvedIdentity): Catalog => running.catalogFor(resolved.roles, resolved.installed);

  // THE SEAMS A FEATURE REGISTERS THROUGH, read by the surfaces below each
  // time they are asked: a credential of its own, by the prefix its tokens
  // carry; and what is laid around the wire a session's screens call through.
  const credentials: { prefix: string; principalOf: (token: string, request: Request) => Promise<CredentialAnswer> }[] = [];
  const wireWraps: ((inner: FetchFn) => FetchFn)[] = [];

  // ── The surfaces ──
  const server = new Hono<Env>();

  // Identity, once, for every surface: Bearer token → principal. Absent
  // header → the anonymous principal (anonymity is a principal, not an
  // error). Invalid token → 401 (an explicit reject beats a silent
  // downgrade to anonymous).
  //
  // A FEATURE'S OWN CREDENTIAL is the second way in, routed by its prefix (an
  // integration's key). The feature says which principal the token stands
  // for, or what to answer instead; the principal is resolved here like any
  // other, and from that line on nothing downstream can tell it from a person.
  server.use('*', async (c, next) => {
    const header = c.req.header('Authorization');
    if (header === undefined) {
      c.set('principal', null);
      c.set('resolved', await identity.resolve(null));
      return next();
    }
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
    const credential = credentials.find(({ prefix }) => token.startsWith(prefix));
    if (credential !== undefined) {
      const answer = await credential.principalOf(token, c.req.raw);
      if ('refused' in answer) return c.json({ error: answer.refused.error, message: answer.refused.message }, answer.refused.status);
      c.set('principal', answer.principal);
      c.set('resolved', await identity.resolve(answer.principal));
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

  // ── THE OPERATOR PREFIX ──────────────────────────────────────
  //
  // Keyed, principal-less, and 404 without — a stranger who finds the path
  // gets the same answer as a stranger with a wrong key, which is nothing. The
  // constant-time key check, plus the app's own gate over the whole prefix if
  // it supplied one (runtime.operatorGate): see guardOperator. The server has
  // no operator route of its own; a feature mounts its routes here, and the
  // prefix is mounted once every feature has.
  const operator = new Hono<Env>();
  guardOperator(operator, { key: runtime.operatorKey ?? '', gate: runtime.operatorGate });

  // The fingerprints somebody may be told of: every read and write the app
  // serves. The policy of whoever asks is compiled on the way, so a principal
  // the charter cannot resolve is refused here as it is on every other route.
  const fingerprintsFor = async (principal: string | null): Promise<string[]> => {
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

  // WHAT A FEATURE IS HANDED (./feature): each member one function or one
  // narrow value of the module that owns it, and nothing of the manifest or
  // the runtime beside what is named.
  const seams: FeatureSeams = {
    routes: (routes) => {
      server.route('/', routes);
    },
    operatorRoutes: (routes) => {
      operator.route('/', routes);
    },
    credential: (prefix, principalOf) => {
      credentials.push({ prefix, principalOf });
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
    ownEntries: data.ownEntries,
    grammars: data.grammars,
    fingerprints: async () => (await data.engine.cache.keys?.()) ?? [],
    fingerprintsFor,
    telemetry: runtime.telemetry,
    signingSeed: runtime.signingSeed,
    wrapWire: (wrap) => {
      wireWraps.push(wrap);
    },
  };

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
        wrapWire: (inner) => wireWraps.reduce((wire, wrap) => wrap(wire), inner),
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

  // THE FEATURES, started once the core stands and before anything is
  // served, in the order the app named them (`NiscApp.features`). Each mounts its routes,
  // registers what it reads and loads what it keeps, through the seams and
  // nothing else; one that throws refuses the boot. BEFORE the pointer is
  // watched: a process that starts has changed nothing for the others, so a
  // set of actions a feature hands over while it starts moves nobody's
  // pointer. And before the operator prefix is mounted, because a prefix's
  // routes are taken when it is mounted.
  for (const feature of app.features ?? []) await feature.start(seams);
  server.route('/operator', operator);

  // From here on a change moves the generation pointer, so every other process
  // drops what it derived within one poll; and a move one of them makes is
  // answered here by reading again every set a feature keeps in rows. Only now, so a
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
