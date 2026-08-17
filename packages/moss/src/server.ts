import { randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Hono } from 'hono';
import { vex } from '@niscorp/vex/hono';
import { handleQuery } from '@niscorp/vex';
import { scopeProfiles } from '@niscorp/vex';
import type { ScopePolicy, WriteEvent } from '@niscorp/vex';
import { verifyCharter } from '@niscorp/charter';
import { auditClosure } from './closure';
import type { NiscApp } from './app';
import type { NiscRuntime } from './runtime';
import { devSession } from './runtime';
import { createDataLayer } from './data';
import { mintWrites } from './tide';
import { memoKey, memoKeyOf, resolveCatalogForRoles, resolvePolicyAtReachForRoles, resolvePolicyForRoles, resolveVariantsForRoles, verifyVariants, wearableOf } from './principal';
import type { Catalog } from './principal';
import type { LayoutNode } from '@niscorp/nova';
import {
  buildContract,
  contractAsMarkdown,
  copyPress,
  describePlacements,
  initIntegrations,
  integrationByKey,
  listIntegrations,
  loadIntegrationActions,
  frameAdmits,
  reachAdmits,
  reachDeclares,
  reachOf,
  runIntake,
} from './integrations';
import type { Reach } from './integrations';
import { createAssertionSigner, hashIntegrationKey, mintIntegrationKey } from './assert';
import { createSocket, DEFAULT_REVALIDATE_MS } from './socket';
import type { SocketAccept } from './socket';
import { createShellHost } from './shells';
import { createIdentityCache } from './identity';
import { createGeneration, GENERATION_DDL } from './generation';
import type { Generation } from './generation';
import type { IdentityRecord, IdentityReport } from './identity';
import type { ShellHost } from './shells';
import { resolveRoles } from './principal';

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
// The app hands over its ARTIFACTS (app.ts) and an environment
// (runtime.ts); everything mechanical is derived — the data layer
// (data.ts), per-principal resolutions (principal.ts) — and the server
// refuses to boot incoherent (DESIGN.md § Derivation over configuration:
// coherence is refused, not documented).
// ═══════════════════════════════════════════════════════════════

// WHO THIS REQUEST IS, resolved ONCE at the door.
//
// `principal` alone was never enough: every consumer downstream immediately
// asked the application three more questions to turn it into roles, scope
// values and an install list — per request, and twice per request for anything
// that compiled a policy at a reach. Resolving it here and carrying it means
// the seams are asked once per SESSION, which is the whole point of the cache
// behind them. `key` is the memo key, derived once with the record rather than
// recomputed by every lookup.
type Resolved = {
  roles: readonly string[];
  scope: Record<string, unknown>;
  installed: readonly string[] | undefined;
  key: string;
  // The record itself, handed back to the app's `scope` hook so a per-request
  // value can be COMPUTED from a per-session fact without a second lookup.
  // Absent when no `identity` seam is declared.
  record?: IdentityRecord;
};

// The capability lent to no-principal machinery: execute a seeded entry as a
// declared charter role. See `createServer` for the four bounds that make it
// tighter than the raw SQL it replaces.
export type ExecuteAs = (role: string, fingerprint: string, context: Record<string, unknown>, scope?: Record<string, unknown>) => Promise<unknown>;

type Env = { Variables: { principal: string | null; resolved: Resolved } };

// The composed app — hono (so a host mounts, extends or listens with any
// runtime adapter; it's the escape hatch for classic routing, too) plus
// the socket's accept, which the runtime's transport feeds new
// connections (see ./node's attachSocket).
export type MossServer = Hono<Env> & {
  socket: SocketAccept;
  shells?: ShellHost;
  // Artifacts changed at runtime (an app that loads actions from rows and just
  // wrote new ones): re-verify coherence, drop every per-principal memo, and
  // have living shells adopt their re-resolved definitions. Throws on an
  // incoherent charter/variant set — a bad publish refuses, exactly like boot.
  refresh: () => void;
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
  // no principal by nature. In-process, replay-only, charter-bounded; see the
  // construction inside `createServer`.
  executeAs: ExecuteAs;
  // FORGET ONE TENANT, not the deployment. The application tags each identity
  // record it resolves (`IdentityRecord.tag`); this drops every record wearing
  // one and answers how many it held. Moss never interprets the tag.
  //
  // This is what makes a tenant-local write tenant-local. `refresh()` is still
  // the right hammer for a changed ARTIFACT, because artifacts are deployment
  // -wide; a tenant installing an integration is not.
  invalidateTenant: (tag: string) => number;
  // The generation this process has observed. Moves when any process calls
  // `refresh`; every process drops its derivations within one poll of it.
  generation: () => number;
  // Every identity resident right now, and what the cache is costing —
  // structural facts only, on the shell-roster model. Absent when the app
  // declares no `identity` seam.
  identities?: { list: () => IdentityReport[]; meter: () => { size: number; max: number; resolved: number; evicted: number; expired: number } };
};

export const createServer = async (app: NiscApp, runtime: NiscRuntime): Promise<MossServer> => {
  // THE INTEGRATIONS TABLES EXIST BEFORE INTROSPECTION. The data layer's
  // introspected schema is the grant universe policies compile from — a table
  // created after it is a table no grant can reach, silently: an app granting
  // `integrations.read` compiled a policy that denied the very screen the
  // grant existed for, and nothing said so until somebody opened it.
  await initIntegrations(runtime.pool);
  const data = await createDataLayer(runtime, app.entries ?? []);

  // ── Refuse to start incoherent — the charter engine verifies,
  // nova audits each role's closure (over effective definitions: granted
  // variants substituted).
  const report = verifyCharter(
    app.charter,
    { actions: Object.keys(app.actions), data: data.grants, layouts: Object.keys(app.layouts ?? {}) },
    wearableOf(app),
    auditClosure(app.actions, app.layouts),
  );
  if (report.errors.length > 0) {
    throw new Error(`Charter is incoherent — refusing to serve:\n${report.errors.map((e) => `  ${e.rule}: ${e.detail}`).join('\n')}`);
  }
  // A DECLARED REACH HAS TO NAME A PROFILE THAT EXISTS.
  //
  // An entry's `reach` is a string, matched at request time against the profiles
  // the behaviors declare. A typo fails CLOSED — an unknown profile denies every
  // table — which is the right runtime posture and a terrible way to find out:
  // the screen comes back empty or refused and nothing says why. Every other
  // string in this file is checked against its universe at boot; so is this one.
  const profiles = new Set(scopeProfiles(app.behaviors ?? {}));
  const badReach = (app.entries ?? [])
    .filter((e) => typeof (e as { reach?: unknown }).reach === 'string')
    .filter((e) => !profiles.has((e as { reach: string }).reach))
    .map((e) => `  ${e.fingerprint} declares reach "${(e as { reach: string }).reach}"`);
  if (badReach.length > 0) {
    throw new Error(
      `Entries declare a reach no table offers — refusing to serve:\n${badReach.join('\n')}\n  known profiles: ${[...profiles].join(', ') || '(none)'}`,
    );
  }

  // Ring-2 coherence: variants reference shipped actions, one variant per
  // action per wearable combination. Same posture, second gate.
  const variantErrors = verifyVariants(app);
  if (variantErrors.length > 0) {
    throw new Error(`Layout variants are incoherent — refusing to serve:\n${variantErrors.map((e) => `  ${e}`).join('\n')}`);
  }

  // ── Per-principal resolutions, computed at first sight (login) and
  // memoized: the documents are static for the process.
  //
  // KEYED BY WHAT THEY DEPEND ON, not by who asked. Every resolution here is a
  // function of (role combination + installed set) - see `memoKeyOf` - so
  // keying by principal stored one entry per PERSON for an answer that has
  // about ten distinct values, in four maps nothing ever evicted. Two people on
  // the same rung at the same tenant now share one compiled policy, which is
  // what they always had; there are simply no longer two copies of it.
  // IDENTITY, held by moss when the application declares the seam. Bounded,
  // evicted, revalidated on the same clock a live socket credential runs on,
  // and enumerable only by an operator. Absent, the three older synchronous
  // seams answer and nothing below changes shape.
  // THE GENERATION POINTER. Created before the memos it protects, polled on the
  // same clock a socket credential is re-verified on, and moved by `refresh`.
  // A process that observes a move re-reads the integration actions and drops
  // every derivation, which is exactly what a restart used to be for.
  for (const statement of GENERATION_DDL) await runtime.pool.query(statement);
  let generation: Generation | undefined;

  // ONE RESOLUTION, TWO HALVES. The app's `resolve` answers what cannot be
  // read under any policy (roles, the tag, an actor's pre-auth scope). Then
  // moss executes the entries the manifest declares — through its own engine,
  // as the charter role `identity.as` names, locked to replay — and merges
  // each mapped object into the record's scope, in order, so a later entry may
  // be pinned by a value an earlier one established. Every value the engine
  // pins by was resolved engine-side; no request authored any of it.
  //
  // FAIL CLOSED, twice: a scope entry that cannot be read merges nothing, so
  // tenant-scoped reads match no rows; a declared `installed` that cannot be
  // read is NO integrations, never every integration.
  // EXECUTE A SEEDED ENTRY AS A DECLARED CHARTER ROLE — the one mechanism for
  // every surface that has no principal by nature: identity resolution, the
  // sign-in credential, a mail provider's callback, the lab's picker.
  //
  // Strictly tighter than the raw SQL it replaces, on four counts: in-process
  // only (never a route); locked to REPLAY (only seeded entries run — no
  // caller-authored query); the policy is compiled from a charter role with
  // declared grants and a declared reach, like any principal's; and the scope
  // values are supplied by server code, never by a request. Widening what a
  // machinery role can touch is a charter diff somebody reviews.
  const executeAs = async (role: string, fingerprint: string, context: Record<string, unknown>, scope: Record<string, unknown> = {}): Promise<unknown> => {
    const roles = [role];
    const outcome = await handleQuery(
      {
        engine: data.engine,
        locked: true,
        scopePolicy: resolvePolicyForRoles(app, data.grants, roles),
        policyForReach: (reach) => resolvePolicyAtReachForRoles(app, data.grants, roles, reach),
        // Mutation replay under the same role policy — write gates and scope
        // pins apply exactly as they would for a person.
        mutations: { client: runtime.db, policy: resolvePolicyForRoles(app, data.grants, roles) },
      },
      { fingerprint, context },
      scope,
    );
    if (outcome.status !== 200) {
      console.error(`[moss:executeAs] "${fingerprint}" as "${role}" refused (${outcome.status})`, outcome.body);
      return undefined;
    }
    const body = outcome.body as Record<string, unknown>;
    return 'result' in body ? body['result'] : undefined;
  };

  const identityEntry = async (roles: readonly string[], fingerprint: string, scope: Record<string, unknown>): Promise<unknown> =>
    executeAs(roles[0] ?? '', fingerprint, {}, scope);

  const composedResolve = async (principal: string): Promise<IdentityRecord> => {
    const config = app.identity;
    if (config === undefined) throw new Error('moss: identity resolved with no seam');
    const reader = config.as === undefined ? undefined : [config.as];
    const read = async (fingerprint: string, scope: Record<string, unknown>): Promise<unknown> => {
      if (reader === undefined) throw new Error('moss: identity.read needs identity.as — name the charter role the reader executes as');
      return identityEntry(reader, fingerprint, scope);
    };
    return config.resolve(principal, read);
  };

  const identities = app.identity !== undefined
    ? createIdentityCache({
        resolve: composedResolve,
        ...(runtime.identityMax !== undefined ? { max: runtime.identityMax } : {}),
        ...(runtime.identityIdleMs !== undefined ? { idleMs: runtime.identityIdleMs } : {}),
        revalidateMs: runtime.sessionRevalidateMs ?? DEFAULT_REVALIDATE_MS,
      })
    : undefined;

  // The memo key derived ONCE per record rather than per lookup. A WeakMap
  // because the cache hands back the same object for the life of a session, and
  // because a key held here must not be the reason a record cannot be collected.
  const keys = new WeakMap<object, string>();
  const keyOf = (record: IdentityRecord): string => {
    const hit = keys.get(record);
    if (hit !== undefined) return hit;
    const key = memoKey(record.roles, record.installed);
    keys.set(record, key);
    return key;
  };

  // THE SCOPE VALUES A PRINCIPAL CARRIES — one spelling, used everywhere.
  //
  // The session's stable half from the identity record, then the clock's from
  // the `scope` hook, applied last and per request. There used to be four
  // spellings of this composition — one at the vex mount and three around the
  // integration surfaces — and a value that reached one but not the others is
  // exactly how an integration learns a member's studio on one route and nothing on the
  // next.
  const composeScope = (principal: string | null, resolved: Resolved): Record<string, unknown> => ({
    userId: principal ?? 'anonymous',
    ...resolved.scope,
    ...(app.scope?.(principal, resolved.record) ?? {}),
  });

  // The same, for the surfaces that have a principal but no request context —
  // the integration proxy and the assertion it signs.
  const scopeValuesFor = async (principal: string | null): Promise<Record<string, unknown>> =>
    composeScope(principal, await resolveIdentity(principal));

  const resolveIdentity = async (principal: string | null): Promise<Resolved> => {
    if (identities !== undefined && principal !== null) {
      const record = await identities.get(principal);
      return { roles: record.roles, scope: record.scope, installed: record.installed, key: keyOf(record), record };
    }
    return fromSeams(principal);
  };

  // The three older seams, asked together — which is what the identity seam
  // above exists to stop doing per request. Still the answer for an application
  // that has not declared `identity`, and still the answer on the two paths
  // below that are per-SESSION rather than per-request and so cost nothing:
  // building a durable shell, and listing an integration's contract.
  function fromSeams(principal: string | null): Resolved {
    const roles = resolveRoles(app, principal);
    const installed = undefined;
    // `scope` is EMPTY here rather than `app.scope(principal)`, because the
    // scope hook is applied at the mount below in both cases — once, per
    // request, over whatever the record carried. Calling it here as well would
    // ask a synchronous seam twice for one answer.
    return { roles, scope: {}, installed, key: memoKey(roles, installed) };
  }

  const policies = new Map<string, ScopePolicy>();
  const policy = (resolved: Resolved): ScopePolicy => {
    const hit = policies.get(resolved.key);
    if (hit !== undefined) return hit;
    const compiled = resolvePolicyForRoles(app, data.grants, resolved.roles);
    policies.set(resolved.key, compiled);
    return compiled;
  };

  // The same principal at a reach an ENTRY demands — same grants, narrower
  // rows. Memoized per (principal, reach) for the same reason the policy above
  // is: the documents are static for the process.
  const reachPolicies = new Map<string, ScopePolicy>();
  const policyAtReach = (resolved: Resolved, reach: string): ScopePolicy => {
    const key = `${resolved.key}\u0000${reach}`;
    const hit = reachPolicies.get(key);
    if (hit !== undefined) return hit;
    const compiled = resolvePolicyAtReachForRoles(app, data.grants, resolved.roles, reach);
    reachPolicies.set(key, compiled);
    return compiled;
  };

  // Approved integrations' actions, folded into the running manifest. Called
  // after an import and after an approval; `refresh()` is what makes living
  // shells adopt.
  const staticActions = { ...app.actions };
  const reloadIntegrations = async (): Promise<void> => {
    const fromRows = await loadIntegrationActions(runtime.pool);
    app.actions = { ...staticActions, ...fromRows };
    refresh();
  };

  const catalogs = new Map<string, Catalog>();
  const catalog = (resolved: Resolved): Catalog => {
    const hit = catalogs.get(resolved.key);
    if (hit !== undefined) return hit;
    const built = resolveCatalogForRoles(app, resolved.roles, resolved.installed);
    catalogs.set(resolved.key, built);
    return built;
  };
  const variantBindings = new Map<string, ReadonlyMap<string, LayoutNode>>();
  const variants = (resolved: Resolved): ReadonlyMap<string, LayoutNode> => {
    const hit = variantBindings.get(resolved.key);
    if (hit !== undefined) return hit;
    const built = resolveVariantsForRoles(app, resolved.roles);
    variantBindings.set(resolved.key, built);
    return built;
  };

  // The same two, keyed by ROLES alone — what `adopt` needs. Adopting is for
  // changed artifacts, not changed people, so a live shell's roles are still
  // its roles and re-resolving the principal would be a round trip to learn
  // what the shell already knows.
  const asRoles = (roles: readonly string[], installed: readonly string[] | undefined): Resolved => ({ roles, scope: {}, installed, key: memoKey(roles, installed) });

  const session = runtime.session ?? devSession;

  // THE DEPLOYMENT'S SIGNING IDENTITY — how an integration knows a call is
  // ours. Generated at boot, never persisted; the public half is served below
  // and verifying it is all anybody can do with it. See assert.ts for the
  // credential rule this and the integration key both follow.
  const assertions = createAssertionSigner(runtime.signingSeed);

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
      c.set('resolved', await resolveIdentity(null));
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
      const resolved = await resolveIdentity(actor);
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
      c.set('resolved', await resolveIdentity(principal));
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

  // THE CHAIN CHANNEL. A tide effect writing back through vex names its
  // chain position in two headers; they ride an AsyncLocalStorage context so
  // the write observer — which fires deep inside the handler, far from any
  // request object — can read them without vex ever learning tide exists.
  // Untrusted at this point: the app's `facts.chain` gate decides whether
  // the caller's word is good.
  const chainContext = new AsyncLocalStorage<{ cause: string; depth: number }>();
  server.use('/api/*', async (c, next) => {
    const cause = c.req.header('x-tide-cause');
    const depth = Number(c.req.header('x-tide-depth'));
    if (cause === undefined || cause === '' || !Number.isInteger(depth) || depth < 0) return next();
    return chainContext.run({ cause, depth }, () => next());
  });

  // The vex surfaces — the adapter does the work; the server resolves WHO.
  // Locked always; scope values and the compiled policy both come from the
  // principal, never from the request.
  const mount = (path: string, entities?: readonly string[]): void => {
    server.route(
      path,
      vex<Env>({
        engine: data.engine,
        ...(entities !== undefined ? { entities: [...entities] } : {}),
        locked: true,
        // `userId` is always the principal; the app's `scope` hook contributes
        // whatever else a principal is (a tenant, an org). Merged server-side,
        // unforgeable by the request — a `to:` in a behavior resolves here.
        // The session's stable values, then the clock's. `scope` is applied
        // last and per request so a value derived from today's date cannot be
        // held for the life of a session that began yesterday.
        getScope: (c) => composeScope(c.get('principal'), c.get('resolved')),
        getPolicy: (c) => policy(c.get('resolved')),
        // An entry that names a reach is served at it, not at the caller's own.
        getPolicyForReach: (c, reach) => policyAtReach(c.get('resolved'), reach),
        mutations: {
          client: runtime.db,
          // Vex's write observer, fired once per committed mutation with
          // per-statement writes. Two consumers, in order of record:
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
          ...(app.reactions !== undefined || app.facts !== undefined
            ? {
                onWrite: (event: WriteEvent) => {
                  const tide = app.facts?.tide();
                  const as = tide !== undefined ? app.facts?.identity(event.scope) : undefined;
                  if (tide !== undefined && as !== undefined) {
                    const hints = chainContext.getStore();
                    const chain = hints === undefined ? undefined : app.facts?.chain?.(event.scope, hints);
                    mintWrites(tide, event, as, Date.now(), chain).catch((err) => console.error('[moss:facts]', err));
                  }
                  const tools = {
                    deliver: (principal: string, channel: string, payload?: unknown) =>
                      (server as MossServer).shells?.deliver(principal, channel, payload) ?? false,
                  };
                  for (const write of event.writes) {
                    if (write.rows.length === 0) continue;
                    for (const reaction of app.reactions ?? []) {
                      if (reaction.table !== write.table || (reaction.op !== undefined && reaction.op !== write.op)) continue;
                      try {
                        reaction.run({ fingerprint: event.fingerprint, table: write.table, op: write.op, count: write.rows.length, scope: event.scope }, tools);
                      } catch (err) {
                        console.error('[moss:reactions]', err);
                      }
                    }
                  }
                },
              }
            : {}),
        },
      }),
    );
  };
  mount('/api/vex');
  for (const [name, resource] of Object.entries(app.resources ?? {})) {
    mount(`/api/${name}/vex`, 'entities' in resource ? resource.entities : resource);
  }

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
    const compiled = policy(await resolveIdentity(principal));
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
  operator.use('*', async (c, next) => {
    const key = runtime.operatorKey ?? '';
    if (key === '' || c.req.header('x-operator-key') !== key) return c.json({ message: 'Not found.' }, 404);
    return next();
  });

  operator.get('/integrations', async (c) => c.json({ integrations: await listIntegrations(runtime.pool) }));

  // Register / announce / re-import — one verb.
  //
  // THE ORDER HERE IS THE WHOLE SAFETY STORY. Intake validates the payload, the
  // candidate action set is verified against the charter, and only then do rows
  // land. A bundle that would make the manifest incoherent is refused with a
  // sentence while the previous import keeps serving — because `refresh()`
  // throws on an incoherent charter, and a bundle committed before that check
  // would take the app down until somebody deleted rows by hand.
  operator.post('/integrations', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { id?: unknown; url?: unknown };
    const id = typeof body.id === 'string' ? body.id : '';
    const url = typeof body.url === 'string' ? body.url : '';
    if (id === '' || url === '') return c.json({ message: 'Give an id and a url.' }, 400);

    let payload: unknown;
    try {
      const response = await fetch(`${url.replace(/\/$/, '')}/bundle`);
      if (!response.ok) throw new Error(String(response.status));
      payload = await response.json();
    } catch {
      await runtime.pool.query(
        `INSERT INTO integrations (id, url, last_error) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, last_error = EXCLUDED.last_error`,
        [id, url, 'the service did not answer with a bundle'],
      );
      return c.json({ message: 'The integration did not answer with a bundle.' }, 502);
    }

    const fingerprints = new Set((await data.engine.cache.keys?.()) ?? []);
    const result = runIntake(payload, {
      integrationId: id,
      components: new Set(Object.keys(app.shell?.components ?? {})),
      fingerprints,
      attachable: new Set(Object.keys(app.attachable ?? {})),
      menuSlots: new Set(app.menuSlots ?? []),
    });
    if (!result.ok) {
      await runtime.pool.query(
        `INSERT INTO integrations (id, url, last_error) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, last_error = EXCLUDED.last_error`,
        [id, url, result.reasons.join('; ')],
      );
      return c.json({ message: 'Refused.', reasons: result.reasons }, 422);
    }

    // Press crosses HERE — after the gate, before the dry-run below touches
    // the live manifest — so a press refusal leaves the app exactly as it
    // found it. Blobs written before a later refusal are orphans in the
    // host's store, which is cheaper than any coherence they could buy.
    const press = await copyPress(result.bundle, id, url, app.storePress);
    if (!press.ok) {
      await runtime.pool.query(
        `INSERT INTO integrations (id, url, last_error) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, last_error = EXCLUDED.last_error`,
        [id, url, press.reasons.join('; ')],
      );
      return c.json({ message: 'Refused.', reasons: press.reasons }, 422);
    }

    // The candidate manifest, verified BEFORE anything is written.
    const existing = await runtime.pool.query('SELECT status, key_hash FROM integrations WHERE id = $1', [id]);
    const existingRow = existing.rows[0] as { status?: unknown; key_hash?: unknown } | undefined;
    const wasApproved = String(existingRow?.status ?? '') === 'approved';
    const holdsKey = typeof existingRow?.key_hash === 'string' && existingRow.key_hash !== '';
    if (wasApproved) {
      const restore = { ...app.actions };
      app.actions = { ...app.actions, ...result.bundle.actions };
      try {
        refresh();
      } catch (err) {
        app.actions = restore;
        refresh();
        return c.json({ message: 'Refused — the app would not serve this.', reasons: [String(err)] }, 422);
      }
    }

    await runtime.pool.query(
      `INSERT INTO integrations (id, url, title, tagline, description, adds, settings_action, requested_actions, requested_data, reach, frames, phrasebook, story, highlights, press, last_import_at, last_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, now(), NULL)
       ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url,
         title = EXCLUDED.title, tagline = EXCLUDED.tagline, description = EXCLUDED.description,
         adds = EXCLUDED.adds, settings_action = EXCLUDED.settings_action,
         requested_actions = EXCLUDED.requested_actions,
         requested_data = EXCLUDED.requested_data,
         reach = EXCLUDED.reach, frames = EXCLUDED.frames,
         phrasebook = EXCLUDED.phrasebook,
         story = EXCLUDED.story, highlights = EXCLUDED.highlights, press = EXCLUDED.press,
         last_import_at = now(), last_error = NULL`,
      [
        id,
        url,
        result.bundle.meta.title,
        result.bundle.meta.tagline,
        result.bundle.meta.description,
        describePlacements(result.bundle, app.placementNames ?? {}),
        result.bundle.settings,
        JSON.stringify(result.bundle.grants.actions),
        JSON.stringify(result.bundle.grants.data),
        // Re-derived on every import, so a screen an integration DROPPED takes its
        // endpoint's reach with it. An allow-list that only ever grows is a
        // list of everything the integration has ever been able to do.
        JSON.stringify(reachOf(result.bundle, id)),
        JSON.stringify(result.bundle.frames),
        // The integration's own words, in the languages it speaks — stored beside
        // its actions so the app's language pass can reach them, and
        // re-imported whole like everything else about a bundle.
        JSON.stringify(result.bundle.phrasebook),
        JSON.stringify(result.bundle.meta.story),
        JSON.stringify(result.bundle.meta.highlights),
        // The urls the HOST answered with at copyPress — the declared paths
        // died the moment the bytes crossed.
        JSON.stringify(press.urls),
      ],
    );
    await runtime.pool.query('DELETE FROM integration_actions WHERE integration_id = $1', [id]);
    for (const [actionId, definition] of Object.entries(result.bundle.actions)) {
      const binding = result.bundle.attachments[actionId];
      const attachTo = binding === undefined ? '' : typeof binding === 'string' ? binding : binding.to;
      const preview = binding === undefined || typeof binding === 'string' ? '' : binding.preview;
      await runtime.pool.query(
        'INSERT INTO integration_actions (integration_id, action_id, definition, attach_to, preview, place_in) VALUES ($1, $2, $3::jsonb, $4, $5, $6)',
        [id, actionId, JSON.stringify(definition), attachTo, preview, result.bundle.placements[actionId] ?? ''],
      );
    }

    // MINTED ONCE, SHOWN ONCE. Registration is a GRANTING ceremony — the
    // deployment issues the integration its identity, never the other way
    // around — so the first registration answers with the key and the row
    // keeps only the hash. A re-import repeats neither: the key is not stored,
    // so there is nothing to repeat. Losing it is not recovery, it is removal
    // and re-registration, which also re-fences everything the old key held.
    const key = holdsKey ? undefined : mintIntegrationKey();
    if (key !== undefined) {
      await runtime.pool.query('UPDATE integrations SET key_hash = $2 WHERE id = $1', [id, hashIntegrationKey(key)]);
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
    const row = await runtime.pool.query('SELECT requested_data FROM integrations WHERE id = $1', [id]);
    if (row.rows[0] === undefined) return c.json({ message: 'No such integration.' }, 404);
    const requested = ((row.rows[0] as { requested_data?: unknown }).requested_data ?? []) as string[];
    await runtime.pool.query(
      "UPDATE integrations SET status = 'approved', approved_data = $2::jsonb WHERE id = $1",
      [id, JSON.stringify(requested)],
    );
    try {
      await reloadIntegrations();
    } catch (err) {
      await runtime.pool.query("UPDATE integrations SET status = 'pending', last_error = $2 WHERE id = $1", [id, String(err)]);
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
    await runtime.pool.query('DELETE FROM integrations WHERE id = $1', [id]);
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
    const row = await runtime.pool.query('SELECT url, reach FROM integrations WHERE id = $1', [id]);
    const found = row.rows[0] as { url?: string; reach?: unknown } | undefined;
    const url = found?.url;
    if (url === undefined) return c.json({ message: 'No such integration.' }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { path?: unknown };
    const path = typeof body.path === 'string' ? body.path : 'bundle';
    // The declaration holds lyra-side paths (`/integrations/<id>/roster`); a
    // probe names the integration-side tail (`roster`), the same tail the proxy
    // forwards. One spelling to compare, derived rather than stored twice.
    if (path !== 'bundle' && !reachDeclares((found?.reach ?? {}) as Reach, `/integrations/${id}/${path}`)) {
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
    const body = (await c.req.json().catch(() => ({}))) as { path?: unknown };
    const path = typeof body.path === 'string' ? body.path : '';
    const id = path.split('/')[2] ?? '';
    const row = await runtime.pool.query('SELECT status, frames FROM integrations WHERE id = $1', [id]);
    const found = row.rows[0] as { status?: string; frames?: unknown } | undefined;
    if (found === undefined || found.status !== 'approved') return c.json({ message: 'No such integration.' }, 404);
    const resolved = await resolveIdentity(principal);
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
    if (!frameAdmits((found.frames ?? {}) as Record<string, string>, path, held)) return c.json({ message: 'No such frame.' }, 404);

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
    const row = await runtime.pool.query('SELECT url, status FROM integrations WHERE id = $1', [id]);
    const found = row.rows[0] as { url?: string; status?: string } | undefined;
    if (found === undefined || found.status !== 'approved') return c.json({ message: 'Not found.' }, 404);
    const installed = (await resolveIdentity(grant.principal)).installed;
    if (installed !== undefined && !installed.includes(id)) return c.json({ message: 'Not found.' }, 404);

    const scope = await scopeValuesFor(grant.principal);
    const rest = grant.path.split('/').slice(3).join('/');
    try {
      const response = await fetch(`${String(found.url).replace(/\/$/, '')}/${rest}`, {
        headers: { authorization: `Bearer ${assertions.mint({ integration: id, principal: grant.principal, scope })}` },
      });
      // THE INTEGRATION'S OWN CONTENT TYPE TRAVELS. A framed page is HTML; forcing
      // `application/json` the way the proxy below used to would hand the
      // browser a document it will not render.
      return new Response(response.body, {
        status: response.status,
        headers: { 'content-type': response.headers.get('content-type') ?? 'text/html; charset=utf-8' },
      });
    } catch {
      return c.json({ message: 'The integration is unreachable.' }, 502);
    }
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

    const row = await runtime.pool.query('SELECT url, status FROM integrations WHERE id = $1', [id]);
    const found = row.rows[0] as { url?: string; status?: string } | undefined;
    if (found === undefined || found.status !== 'approved') return c.json({ message: 'Not found.' }, 404);
    const installed = (await resolveIdentity(grant.principal)).installed;
    if (installed !== undefined && !installed.includes(id)) return c.json({ message: 'Not found.' }, 404);

    // Beside the page, never above it: the declared frame's own directory.
    const rest = grant.path.split('/').slice(3);
    rest.pop();
    const target = [...rest, call].join('/');

    const scope = await scopeValuesFor(grant.principal);
    try {
      const response = await fetch(`${String(found.url).replace(/\/$/, '')}/${target}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${assertions.mint({ integration: id, principal: grant.principal, scope })}`,
        },
        body: await c.req.text(),
      });
      return new Response(response.body, {
        status: response.status,
        headers: {
          'content-type': response.headers.get('content-type') ?? 'application/json',
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
          'access-control-allow-origin': 'null',
          vary: 'origin',
        },
      });
    } catch {
      return c.json({ message: 'The integration is unreachable.' }, 502);
    }
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
    const row = await runtime.pool.query('SELECT url, status FROM integrations WHERE id = $1', [id]);
    const found = row.rows[0] as { url?: string; status?: string } | undefined;
    // 404 for "no such integration" AND for "not approved yet" — the same
    // answer, so a stranger probing this learns nothing about which integrations a
    // deployment is currently considering.
    if (found === undefined || found.status !== 'approved') return c.json({ message: 'Not found.' }, 404);
    if (!hookAllows(id, Date.now())) return c.json({ message: 'Too many.' }, 429);

    const here = new URL(c.req.url);
    const rest = `${here.pathname.split('/').slice(3).join('/')}${here.search}`;
    // Every header the vendor set travels, because the signature is in one of
    // them and moss does not know which. `authorization` is dropped: this path
    // mints no identity, and a bearer arriving here must not read as one on the
    // other side. `host` would name us rather than them.
    const headers = new Headers(c.req.raw.headers);
    headers.delete('authorization');
    headers.delete('host');
    try {
      const response = await fetch(`${String(found.url).replace(/\/$/, '')}/${rest}`, {
        method: 'POST',
        headers,
        body: await c.req.arrayBuffer(),
      });
      return new Response(response.body, {
        status: response.status,
        headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
      });
    } catch {
      // A vendor reads 502 as "retry me", which is what we want: the delivery
      // is not lost, it is deferred until the integration is back.
      return c.json({ message: 'The integration is unreachable.' }, 502);
    }
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
    const row = await runtime.pool.query('SELECT url, status, reach FROM integrations WHERE id = $1', [id]);
    const found = row.rows[0] as { url?: string; status?: string; reach?: unknown } | undefined;
    if (found === undefined || found.status !== 'approved') return c.json({ message: 'No such integration.' }, 404);
    const resolved = await resolveIdentity(principal);
    if (resolved.installed !== undefined && !resolved.installed.includes(id)) return c.json({ message: 'Not installed here.' }, 404);

    // THE DECLARATION IS THE PERIMETER (integrations.ts, reachOf). Before this,
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
    // credential, not even one that would have died at the other end. And 404
    // rather than 403, like the branches above it — what somebody may not reach,
    // they do not learn the existence of.
    const held = new Set(catalog(resolved).ids);
    if (!reachAdmits((found.reach ?? {}) as Reach, c.req.path, held)) return c.json({ message: 'No such integration.' }, 404);

    const scope = await scopeValuesFor(principal);
    // The QUERY TRAVELS. `c.req.path` drops it, so an endpoint declared with
    // `?view=summary` arrived at the integration without it — the integration answered a
    // different question than the screen asked, and nothing said so.
    const here = new URL(c.req.url);
    const rest = `${here.pathname.split('/').slice(3).join('/')}${here.search}`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${assertions.mint({ integration: id, principal, scope })}`,
    };
    try {
      const response = await fetch(`${String(found.url).replace(/\/$/, '')}/${rest}`, {
        method: c.req.method,
        headers,
        ...(c.req.method === 'GET' ? {} : { body: await c.req.text() }),
      });
      // What the integration answered WITH, not what we assumed it answered with.
      return new Response(response.body, {
        status: response.status,
        headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
      });
    } catch {
      // An integration that is down is an ordinary condition: the action's
      // onError shows the sentence and nothing is claimed.
      return c.json({ message: 'The integration is unreachable.' }, 502);
    }
  });

  // The socket speaks for the same principals the HTTP surfaces serve —
  // one session verifier, one catalog resolution, one version token. When
  // the manifest declares a shell, server shells stand behind it: their
  // endpoint calls ride the server's OWN surfaces with the session's token
  // (same wire, same enforcement — the shell is just another client).
  const shells = app.shell !== undefined
    ? createShellHost({
        app,
        // ONE resolution per shell build, awaited. This was four synchronous
        // questions, and every one of them was ultimately answered out of a
        // resident map of the population.
        resolve: async (principal) => {
          const resolved = await resolveIdentity(principal);
          // THE INSTALL LIST IS RE-READ AT BUILD. A shell is the long-lived
          // thing here: an identity record may have been resolved before the
          // tenant installed an integration, and a shell built from it would be missing
          // that integration's screens for the life of the session. Once per shell,
          // not once per request — the seam this consults is synchronous and
          // cheap, and it is the same one `adopt` re-reads for the same reason.
          // The record IS the install list now — resolved through the same
          // engine entries as everything else, revalidated on the identity
          // cache's own clock.
          return { roles: resolved.roles, scope: resolved.scope, installed: resolved.installed, catalog: catalog(resolved), variants: variants(resolved), policy: policy(resolved) };
        },
        catalogFor: (roles, installed) => catalog(asRoles(roles, installed)),
        variantsFor: (roles) => variants(asRoles(roles, undefined)),
        runtime,
        ...(runtime.shellIdleMs !== undefined ? { idleMs: runtime.shellIdleMs } : {}),
        ...(runtime.shellFrameDelta !== undefined ? { delta: runtime.shellFrameDelta } : {}),
        wire: (token) => async (url, init) => {
          const res = await server.request(url, {
            method: init?.method ?? 'GET',
            headers: { ...(init?.headers ?? {}), ...(token !== null ? { Authorization: `Bearer ${token}` } : {}) },
            ...(init?.body !== undefined ? { body: init.body } : {}),
          });
          // Vex replies `{ result, meta }`; endpoints want the data — the
          // same unwrap the client wire applies, so an action behaves
          // identically under either shell.
          if (!url.split('?')[0]?.endsWith('/vex') || !res.ok) return res;
          const body = (await res.json()) as Record<string, unknown> | null;
          const result = body !== null && typeof body === 'object' && 'result' in body ? body['result'] : body;
          return {
            ok: res.ok,
            status: res.status,
            json: () => Promise.resolve(result),
            text: () => Promise.resolve(JSON.stringify(result)),
          };
        },
      })
    : undefined;

  // Artifacts changed at runtime — an app that loads actions from rows and
  // just wrote new ones. Same gates as boot (an incoherent publish REFUSES and
  // the process keeps serving the old resolution), then the memos drop and
  // living shells adopt their re-resolved definitions in place: no rebuild,
  // no lost canvas state, new actions simply become pushable.
  const refresh = (): void => {
    refreshLocal();
    // EVERY OTHER PROCESS TOO. `refresh` means rows changed under a derivation,
    // and this process is not the only one holding derivations from them.
    generation?.bump();
  };

  // The same drop, without moving the pointer -- what a process does when it
  // OBSERVES a move somebody else made. Bumping here would have every process
  // bump every other process forever.
  const refreshLocal = (): void => {
    const nextReport = verifyCharter(
      app.charter,
      { actions: Object.keys(app.actions), data: data.grants, layouts: Object.keys(app.layouts ?? {}) },
      wearableOf(app),
      auditClosure(app.actions, app.layouts),
    );
    if (nextReport.errors.length > 0) {
      throw new Error(`Refresh refused — charter incoherent over the new artifacts:\n${nextReport.errors.map((e) => `  ${e.rule}: ${e.detail}`).join('\n')}`);
    }
    const nextVariantErrors = verifyVariants(app);
    if (nextVariantErrors.length > 0) {
      throw new Error(`Refresh refused — layout variants incoherent:\n${nextVariantErrors.map((e) => `  ${e}`).join('\n')}`);
    }
    // IDENTITY GOES WITH THEM. `refresh` exists because something the
    // resolutions were derived FROM changed — an approval, a role, an artifact.
    // Dropping the compiled policies while keeping the records they were
    // compiled from is keeping the stale half: a promoted instructor would hold
    // their old rung until the record expired on its own clock.
    identities?.invalidateAll();
    policies.clear();
    // `reachPolicies` too — it is compiled from the same grants as `policies`
    // and went stale with it. Leaving it standing meant an approval or a role
    // change was honoured at the caller's own reach and ignored at every reach
    // an entry declared, for the life of the process.
    reachPolicies.clear();
    catalogs.clear();
    variantBindings.clear();
    shells?.adopt();
  };

  // WHATEVER WAS APPROVED BEFORE THIS PROCESS STARTED is part of the
  // application, so it is folded in before anything is served — not on first
  // request and not on a timer. It happens here rather than beside the routes
  // because it calls `refresh`, which is declared below them.
  {
    const fromRows = await loadIntegrationActions(runtime.pool);
    if (Object.keys(fromRows).length > 0) {
      app.actions = { ...staticActions, ...fromRows };
      refresh();
    }
  }

  generation = createGeneration(runtime.pool, {
    ...(runtime.sessionRevalidateMs !== undefined ? { everyMs: runtime.sessionRevalidateMs } : {}),
    onMoved: async () => {
      // Somebody else wrote. Re-read what is loaded FROM rows (an approval lands
      // as new actions), then drop every derivation without moving the pointer
      // again.
      const fromRows = await loadIntegrationActions(runtime.pool);
      app.actions = { ...staticActions, ...fromRows };
      refreshLocal();
    },
  });

  return Object.assign(server, {
    socket: createSocket({
      session,
      catalog: async (principal) => catalog(await resolveIdentity(principal)),
      ...(shells !== undefined ? { shells } : {}),
      ...(runtime.sessionRevalidateMs !== undefined ? { revalidateMs: runtime.sessionRevalidateMs } : {}),
    }),
    ...(shells !== undefined ? { shells } : {}),
    refresh,
    generation: () => generation?.current() ?? -1,
    executeAs,
    identity: async (principal: string | null) => {
      const resolved = await resolveIdentity(principal);
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
      return (identities?.invalidateTag(tag) ?? []).length;
    },
    invalidateIdentity: (principal: string) => {
      // The compiled memos are keyed by (roles + installed), not by principal,
      // so they need no clearing here: a re-resolved record either lands on the
      // same key — in which case the memo was already right — or on a different
      // one, which was never this principal's to begin with.
      const held = identities?.invalidate(principal) ?? false;
      shells?.reset(principal);
      return held;
    },
    ...(identities !== undefined ? { identities: { list: identities.list, meter: identities.meter } } : {}),
  });
};
