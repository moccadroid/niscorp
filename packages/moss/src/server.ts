import { Hono } from 'hono';
import { vex } from '@niscorp/vex/hono';
import type { ScopePolicy } from '@niscorp/vex';
import { verifyCharter } from '@niscorp/charter';
import { auditClosure } from './closure';
import type { NiscApp } from './app';
import type { NiscRuntime } from './runtime';
import { devSession } from './runtime';
import { createDataLayer } from './data';
import { resolveCatalog, resolvePolicy, resolveVariants, verifyVariants } from './principal';
import type { Catalog } from './principal';
import type { LayoutNode } from '@niscorp/nova';
import { createSocket } from './socket';
import type { SocketAccept } from './socket';
import { createShellHost } from './shells';
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

type Env = { Variables: { principal: string | null } };

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
};

export const createServer = async (app: NiscApp, runtime: NiscRuntime): Promise<MossServer> => {
  const data = await createDataLayer(runtime, app.entries ?? []);

  // ── Refuse to start incoherent — the charter engine verifies,
  // nova audits each role's closure (over effective definitions: granted
  // variants substituted).
  const report = verifyCharter(
    app.charter,
    { actions: Object.keys(app.actions), data: data.grants, layouts: Object.keys(app.layouts ?? {}) },
    app.assignments,
    auditClosure(app.actions, app.layouts),
  );
  if (report.errors.length > 0) {
    throw new Error(`Charter is incoherent — refusing to serve:\n${report.errors.map((e) => `  ${e.rule}: ${e.detail}`).join('\n')}`);
  }
  // Ring-2 coherence: variants reference shipped actions, one variant per
  // action per wearable combination. Same posture, second gate.
  const variantErrors = verifyVariants(app);
  if (variantErrors.length > 0) {
    throw new Error(`Layout variants are incoherent — refusing to serve:\n${variantErrors.map((e) => `  ${e}`).join('\n')}`);
  }

  // ── Per-principal resolutions, computed at first sight (login) and
  // memoized: the documents are static for the process.
  const policies = new Map<string | null, ScopePolicy>();
  const policy = (principal: string | null): ScopePolicy => {
    const hit = policies.get(principal);
    if (hit !== undefined) return hit;
    const compiled = resolvePolicy(app, data.grants, principal);
    policies.set(principal, compiled);
    return compiled;
  };
  const catalogs = new Map<string | null, Catalog>();
  const catalog = (principal: string | null): Catalog => {
    const hit = catalogs.get(principal);
    if (hit !== undefined) return hit;
    const resolved = resolveCatalog(app, principal);
    catalogs.set(principal, resolved);
    return resolved;
  };
  const variantBindings = new Map<string | null, ReadonlyMap<string, LayoutNode>>();
  const variants = (principal: string | null): ReadonlyMap<string, LayoutNode> => {
    const hit = variantBindings.get(principal);
    if (hit !== undefined) return hit;
    const resolved = resolveVariants(app, principal);
    variantBindings.set(principal, resolved);
    return resolved;
  };

  const session = runtime.session ?? devSession;

  // ── The surfaces ──
  const server = new Hono<Env>();

  // Identity, once, for every surface: Bearer token → principal. Absent
  // header → the anonymous principal (anonymity is a principal, not an
  // error). Invalid token → 401 (an explicit reject beats a silent
  // downgrade to anonymous).
  server.use('*', async (c, next) => {
    const header = c.req.header('Authorization');
    if (header === undefined) {
      c.set('principal', null);
      return next();
    }
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
    const principal = await session(token);
    if (principal === null) {
      return c.json({ error: 'invalid_token', message: 'The session token did not resolve to a principal.' }, 401);
    }
    c.set('principal', principal);
    return next();
  });

  // /catalog — the application, resolved for YOU.
  server.get('/catalog', (c) => {
    const principal = c.get('principal');
    const { ids, hash } = catalog(principal);
    return c.json({ principal, actions: ids, hash });
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
        getScope: (c) => ({ userId: c.get('principal') ?? 'anonymous', ...(app.scope?.(c.get('principal')) ?? {}) }),
        getPolicy: (c) => policy(c.get('principal')),
        mutations: { client: runtime.db },
      }),
    );
  };
  mount('/api/vex');
  for (const [name, resource] of Object.entries(app.resources ?? {})) {
    mount(`/api/${name}/vex`, 'entities' in resource ? resource.entities : resource);
  }

  // The socket speaks for the same principals the HTTP surfaces serve —
  // one session verifier, one catalog resolution, one version token. When
  // the manifest declares a shell, server shells stand behind it: their
  // endpoint calls ride the server's OWN surfaces with the session's token
  // (same wire, same enforcement — the shell is just another client).
  const shells = app.shell !== undefined
    ? createShellHost({
        app,
        catalog,
        variants,
        roles: (principal) => resolveRoles(app, principal),
        runtime,
        policy,
        ...(runtime.shellIdleMs !== undefined ? { idleMs: runtime.shellIdleMs } : {}),
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
    const nextReport = verifyCharter(
      app.charter,
      { actions: Object.keys(app.actions), data: data.grants, layouts: Object.keys(app.layouts ?? {}) },
      app.assignments,
      auditClosure(app.actions, app.layouts),
    );
    if (nextReport.errors.length > 0) {
      throw new Error(`Refresh refused — charter incoherent over the new artifacts:\n${nextReport.errors.map((e) => `  ${e.rule}: ${e.detail}`).join('\n')}`);
    }
    const nextVariantErrors = verifyVariants(app);
    if (nextVariantErrors.length > 0) {
      throw new Error(`Refresh refused — layout variants incoherent:\n${nextVariantErrors.map((e) => `  ${e}`).join('\n')}`);
    }
    policies.clear();
    catalogs.clear();
    variantBindings.clear();
    shells?.adopt();
  };

  return Object.assign(server, {
    socket: createSocket({
      session,
      catalog,
      ...(shells !== undefined ? { shells } : {}),
      ...(runtime.sessionRevalidateMs !== undefined ? { revalidateMs: runtime.sessionRevalidateMs } : {}),
    }),
    ...(shells !== undefined ? { shells } : {}),
    refresh,
  });
};
