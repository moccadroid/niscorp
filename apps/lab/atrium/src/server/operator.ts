import { timingSafeEqual } from 'node:crypto';
import { verifyCharter } from '@niscorp/charter';
import { auditClosure } from '@niscorp/moss';
import { scopeGrants } from '@niscorp/vex';
import type { MossServer, NiscApp, FunctionSession, ShellHost } from '@niscorp/moss';
import { CHARTER, ASSIGNMENTS } from '@atrium/app/charter';
import { TABLES } from '@atrium/db/schema';
import { resolveStatements } from '@atrium/db/resolve';
import { grantedOf } from '@atrium/server/assistant/knowledge';
import { bundleState, lastSync, refreshServer, syncIntegrations } from '@atrium/server/bundles';
import { userById } from '@atrium/server/users';
import type { DevRuntime } from './runtime';

// ═══════════════════════════════════════════════════════════
// THE OPERATOR SEAM — the socket our administration tool plugs into.
//
// It is not part of the application. No principal reaches it, no charter role
// grants it, no action calls it: the gate is a key WE hold, checked here,
// against a header no browser of ours ever sends. A hotel cannot find this
// surface by holding a better token, because a token is not what it wants.
//
// What it serves is the app's own in-memory truth — the artifacts moss builds
// at boot and then keeps to itself. `verifyCharter` computes the full resolved
// closure of every role on every boot and moss reads only its `errors`; the
// catalog resolver answers for any principal and is only ever asked about the
// caller. Both are already the answers "what can this actor reach" needs. They
// were simply never surfaced.
//
// The line it does not cross: this serves ARTIFACTS and RESOLUTION, never
// customer rows. It mounts no vex, holds no policy, and every SQL statement
// below reads the meta tables or writes the resolved layer. It can say that
// Amara's role resolves to fourteen actions. It cannot say what she wrote to
// the desk, and adding that would be a different product.
//
// This is the piece that is app-shaped only by accident. Everything it does is
// `NiscApp` artifacts plus moss runtime seams, which is why it can move into
// moss later and make every defineApp server administrable by construction.
// Until it has earned that, it lives here (PLAN.md: nothing outside the app).
// ═══════════════════════════════════════════════════════════

const operatorKey = (): string => process.env['OPERATOR_KEY'] ?? '';

// Constant-time, length-difference included: comparing a short guess against a
// long key must not answer faster than comparing two long ones.
const keyMatches = (offered: string): boolean => {
  const expected = operatorKey();
  if (expected === '' || offered === '') return false;
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
};

// ─── the timeline ────────────────────────────────────────────
//
// The roster that used to live here is gone. It was a map this app kept
// beside moss's — one note per session, because moss owned the shells and
// enumerated nothing — and it was wrong in a way no care could fix: a shell
// disposed by a sign-out left the map when a read next happened to notice,
// not when it died. `shells.list()` is now moss's own enumeration of its own
// map, so the answer cannot drift from the thing it describes. Dropping this
// map also drops what it was quietly doing: holding every session that ever
// connected, forever.
//
// What is left needs no registry. `onEndpoint` is subscribed on the living
// shell and the closure keeps the one session it reads.
// Every endpoint a living shell calls — `fn:` and HTTP alike — with its outcome
// and how long it took. nova already fires this (`onEndpoint`, the observability
// seam); nothing was listening on the server side.
//
// NAMES AND TIMINGS ONLY. No request body, no response, no payload of any kind
// — which is what keeps a feed of what the app is doing on the right side of
// the line. A call to `messages/inbox` appears; what came back does not, and
// there is no field here that could carry it.
type Call = { at: number; principal: string; action: string; canvas: string; name: string; kind: string; ok: boolean; status: number; ms: number };

const TIMELINE_CAP = 300;
const timeline: Call[] = [];

const definitionOf = (session: FunctionSession, instanceId: string): string => {
  for (const canvas of Object.values(session.shell.getState().canvases)) {
    const found = canvas.stack.find((instance) => instance.id === instanceId);
    if (found !== undefined) return found.definitionId;
  }
  return '';
};

export const registerShellSession = (session: FunctionSession): void => {
  if (session.principal === null) return; // anonymous shells are ephemeral
  const principal = session.principal;

  // Deferred a microtask: `session.shell` throws until the build finishes, and
  // this runs mid-build. A shell that never finished is simply never watched.
  queueMicrotask(() => {
    try {
      session.shell.onEndpoint((event) => {
        timeline.push({
          at: Date.now(),
          principal,
          action: definitionOf(session, event.instanceId),
          canvas: event.canvasId,
          name: event.name,
          kind: event.kind,
          ok: event.ok,
          status: event.status,
          ms: Math.round(event.ms),
        });
        if (timeline.length > TIMELINE_CAP) timeline.shift();
      });
    } catch {
      /* the session never finished building — nothing to watch */
    }
  });
};

// ─── the reads ───────────────────────────────────────────────

// Every principal the charter knows, and what ring 1 resolves to for each.
// `grantedOf` is the assistant's resolver, and it is the right one twice over:
// it runs over core PLUS the synced bundles (a catalog that forgets the
// bundles silently drops every ext.* surface), and it takes an arbitrary
// principal rather than a session — which is the whole difference between a
// tool that shows you your own application and one that shows you everyone's.
const actors = (): unknown => ({
  principals: Object.keys(ASSIGNMENTS).map((id) => {
    const user = userById(id);
    const actions = [...grantedOf(id)].sort();
    return {
      id,
      username: user?.username ?? '',
      name: user?.name ?? id,
      audience: user?.audience ?? '',
      property: user?.propertyName ?? '',
      propertyId: user?.propertyId ?? '',
      roles: [...(ASSIGNMENTS[id] ?? [])],
      actions,
      core: actions.filter((a) => !a.startsWith('ext.')).length,
      ext: actions.filter((a) => a.startsWith('ext.')).length,
    };
  }),
  // Anonymous is a principal, not an absence — and what it resolves to is the
  // login page and nothing else. Worth seeing next to the others.
  anonymous: { actions: [...grantedOf(null)].sort() },
});

// The charter as authored, beside what it compiles to. `perRole` is the
// artifact moss computes on every boot and every refresh and then discards;
// the warnings are the ones it never raises because they are not errors —
// a dead allow, an action no role grants.
const charterReport = (app: NiscApp): unknown => {
  const report = verifyCharter(
    app.charter,
    { actions: Object.keys(app.actions), data: scopeGrants([...TABLES]), layouts: Object.keys(app.layouts ?? {}) },
    app.assignments,
    auditClosure(app.actions, app.layouts),
  );
  return {
    roles: report.perRole.map((role) => ({ role: role.role, actions: role.actions, data: role.data, issues: role.issues })),
    warnings: report.warnings.map((warning) => ({ rule: warning.rule, detail: warning.detail })),
    authored: CHARTER,
  };
};

// Every action the running server would serve to somebody, with where it came
// from. `ext.` is the bundle namespace, so its source is a connector row.
const actionsReport = async (app: NiscApp, runtime: DevRuntime): Promise<unknown> => {
  const rows = await runtime.pool.query('SELECT id, connector_id, audience FROM bundle_actions', []);
  const source = new Map(rows.rows.map((row) => [String(row['id']), String(row['connector_id'])]));
  return {
    actions: Object.entries(app.actions)
      .map(([id, definition]) => {
        const input = (definition.input as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
        return {
          id,
          title: definition.title ?? id,
          source: source.get(id) ?? 'core',
          audience: id.startsWith('ext.') ? (id.split('.')[1] ?? '') : (id.split('.')[0] ?? ''),
          // Declaring `expanded` is what makes an action composable onto a
          // home — the marker the seeding looks for, so it is a fact about the
          // action worth showing.
          preview: 'expanded' in input,
          input: Object.keys(input).sort(),
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
};

// The estate: every slot we ship, every property, and the resolver's verdict
// for each pair. This is the four-factor argument as a table — and the only
// place the whole of it is visible at once, because every other reader of
// property_slots is asking about one property from inside it.
const surfaceReport = async (runtime: DevRuntime): Promise<unknown> => {
  const properties = await runtime.pool.query(
    `SELECT p.id, p.name, p.city, c.name AS connector, p.synced_at
     FROM properties p JOIN connectors c ON c.id = p.connector_id ORDER BY p.name`,
    [],
  );
  const slots = await runtime.pool.query(
    `SELECT id, audience, action_id, title, capability_id, source, canvas, stay_state, enabled, position
     FROM surface_slots ORDER BY audience, position, id`,
    [],
  );
  const resolved = await runtime.pool.query('SELECT property_id, slot_id, live, reason FROM property_slots', []);
  return { properties: properties.rows, slots: slots.rows, resolved: resolved.rows };
};

// What each connector offers and what each property took — the two switch sets
// behind every resolution above.
const configReport = async (runtime: DevRuntime): Promise<unknown> => {
  const connectors = await runtime.pool.query('SELECT id, name, vendor, kind, live_version, service_url, notes FROM connectors ORDER BY id', []);
  const offers = await runtime.pool.query(
    `SELECT cc.id, cc.connector_id, cc.capability_id, cc.version, cc.enabled, cap.label
     FROM connector_capabilities cc JOIN capabilities cap ON cap.id = cc.capability_id
     ORDER BY cc.connector_id, cc.capability_id`,
    [],
  );
  const enabled = await runtime.pool.query(
    `SELECT pc.id, pc.property_id, pc.capability_id, pc.enabled, cap.label, p.name AS property_name
     FROM property_capabilities pc
     JOIN capabilities cap ON cap.id = pc.capability_id
     JOIN properties p ON p.id = pc.property_id
     ORDER BY p.name, pc.capability_id`,
    [],
  );
  return { connectors: connectors.rows, offers: offers.rows, properties: enabled.rows };
};

// ─── the entries: the app's data API, as an artifact ─────────
//
// Every seeded cache entry is a named query with a fixed shape, and together
// they ARE the API — the app is warm-only, so a fingerprint nobody seeded is a
// 500 rather than a silent generate. That makes two derived facts worth as much
// as the listing: entries nothing calls (dead weight, or a surface someone
// forgot to wire) and calls with no entry (a 500 waiting for the first person
// to click it). Neither is visible from anywhere else.

// Which entry an endpoint asks for. The request seam is a plain object with a
// literal fingerprint — intake enforces that for bundles, and the core prisms
// follow the same shape — so this is a read, not an evaluation.
const fingerprintOf = (request: unknown): string | undefined => {
  const held = (request as Record<string, unknown> | null)?.['fingerprint'];
  return typeof held === 'string' ? held : undefined;
};

// The tables a DSL touches, found the only way that cannot drift: by looking.
// `from` is usually a list (a join names several) and occasionally holds a
// subquery object, so both shapes are walked rather than assumed.
const TABLE_KEYS = new Set(['from', 'entity', 'table', 'into']);

const tablesOf = (dsl: unknown, found: Set<string> = new Set()): Set<string> => {
  if (Array.isArray(dsl)) {
    for (const item of dsl) tablesOf(item, found);
    return found;
  }
  if (dsl === null || typeof dsl !== 'object') return found;
  for (const [key, value] of Object.entries(dsl as Record<string, unknown>)) {
    if (!TABLE_KEYS.has(key)) {
      tablesOf(value, found);
      continue;
    }
    if (typeof value === 'string') found.add(value);
    else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') found.add(item);
        else tablesOf(item, found);
      }
    } else tablesOf(value, found);
  }
  return found;
};

// A read's shape is the ROW it returns, written as a one-element array; a
// write's is an object. Both answer "what comes back".
const shapeKeys = (shape: unknown): string[] => {
  const row = Array.isArray(shape) ? shape[0] : shape;
  return row !== null && typeof row === 'object' && !Array.isArray(row) ? Object.keys(row as Record<string, unknown>) : [];
};

const CONTEXT_KEY = /"\$context":"(\w+)"/g;

const entriesReport = async (app: NiscApp, runtime: DevRuntime): Promise<unknown> => {
  const rows = await runtime.pool.query('SELECT fingerprint, connector_id FROM bundle_entries', []);
  const source = new Map(rows.rows.map((row) => [String(row['fingerprint']), String(row['connector_id'])]));

  // Who calls what. One walk over every endpoint of every action the server
  // would serve — core and shipped alike.
  const callers = new Map<string, { action: string; endpoint: string; url: string }[]>();
  for (const [actionId, definition] of Object.entries(app.actions)) {
    for (const [name, endpoint] of Object.entries((definition.endpoints ?? {}) as Record<string, Record<string, unknown>>)) {
      const fingerprint = fingerprintOf(endpoint['request']);
      if (fingerprint === undefined) continue;
      const list = callers.get(fingerprint) ?? [];
      list.push({ action: actionId, endpoint: name, url: String(endpoint['url'] ?? '') });
      callers.set(fingerprint, list);
    }
  }

  // The manifest's entries plus the live bundle registry, deduped.
  //
  // Worth knowing why both: `app.entries` is fixed at build, and boot's refresh
  // re-reads bundle ACTIONS into the running manifest but not bundle entries —
  // it does not need to, because a sync seeds them straight into vex_cache and
  // the engine reads from there. Harmless for the app, and a hole for anything
  // trying to describe the API: on a fresh database the manifest array holds
  // core entries only.
  const known = new Map<string, unknown>();
  for (const entry of [...(app.entries ?? []), ...bundleState.entries]) {
    known.set(String((entry as unknown as Record<string, unknown>)['fingerprint'] ?? ''), entry);
  }

  const seeded = new Set<string>();
  const entries = [...known.values()].map((entry) => {
    const record = entry as unknown as Record<string, unknown>;
    const fingerprint = String(record['fingerprint'] ?? '');
    seeded.add(fingerprint);
    const dsl = record['dsl'];
    const shape = record['shape'];
    return {
      fingerprint,
      intent: String(record['intent'] ?? ''),
      kind: dsl === undefined ? 'write' : 'read',
      source: source.get(fingerprint) ?? 'core',
      context: [...new Set([...JSON.stringify(record).matchAll(CONTEXT_KEY)].map((match) => match[1] ?? ''))].filter((key) => key !== ''),
      tables: [...tablesOf(dsl ?? record['mutation'] ?? record)].sort(),
      shape: shapeKeys(shape),
      callers: callers.get(fingerprint) ?? [],
      definition: entry,
    };
  });

  // Called, never seeded. In a warm-only app this is not a warning.
  const missing = [...callers.entries()]
    .filter(([fingerprint]) => !seeded.has(fingerprint))
    .map(([fingerprint, list]) => ({ fingerprint, callers: list }));

  return { entries, missing };
};

// The endpoint feed, newest first.
const timelineReport = (): unknown => ({ calls: [...timeline].reverse() });

// Every model run: what it said, what it called, what it cost. Four cuts of one
// table — nothing is pre-aggregated on write, so a different question is a
// different GROUP BY rather than a migration.
//
// Read here rather than through vex because this is the one place that may see
// ACROSS principals: a hotel reads its own rows under a personal scope, and the
// whole point of the view is comparing them. The seam is key-gated and serves no
// guest data — a transcript of the assistant's own reasoning is not a folio.
const runsReport = async (runtime: DevRuntime): Promise<unknown> => {
  const runs = await runtime.pool.query(
    `SELECT r.id, r.user_id, r.agent_id, r.agent_path, r.label, r.provider, r.model,
            r.input_tokens, r.output_tokens, r.total_tokens,
            r.reported, r.steps, r.elapsed_ms, r.outcome, r.turns, r.response, r.created_at
       FROM assistant_runs r
      ORDER BY r.created_at DESC
      LIMIT 200`,
    [],
  );
  const byPerson = await runtime.pool.query(
    `SELECT user_id,
            COUNT(*)::int AS runs,
            SUM(input_tokens)::int AS input_tokens,
            SUM(output_tokens)::int AS output_tokens,
            SUM(total_tokens)::int AS total_tokens,
            SUM(CASE WHEN label = 'watch' THEN 1 ELSE 0 END)::int AS unasked,
            SUM(CASE WHEN outcome <> 'ok' THEN 1 ELSE 0 END)::int AS failed
       FROM assistant_runs
      GROUP BY user_id
      ORDER BY total_tokens DESC`,
    [],
  );
  const byModel = await runtime.pool.query(
    `SELECT provider, model,
            COUNT(*)::int AS runs,
            SUM(input_tokens)::int AS input_tokens,
            SUM(output_tokens)::int AS output_tokens,
            SUM(total_tokens)::int AS total_tokens,
            (AVG(elapsed_ms))::int AS avg_ms
       FROM assistant_runs
      GROUP BY provider, model
      ORDER BY total_tokens DESC`,
    [],
  );
  // The axis that makes this a view of AGENTS rather than of one assistant: the
  // record carries whichever agent ran, so a second one shipped tomorrow appears
  // here without a line of code.
  const byAgent = await runtime.pool.query(
    `SELECT agent_id,
            COUNT(*)::int AS runs,
            SUM(total_tokens)::int AS total_tokens,
            (AVG(elapsed_ms))::int AS avg_ms,
            (AVG(steps))::numeric(4,1) AS avg_steps
       FROM assistant_runs
      GROUP BY agent_id
      ORDER BY total_tokens DESC`,
    [],
  );
  const totals = await runtime.pool.query(
    `SELECT COUNT(*)::int AS runs, SUM(total_tokens)::int AS total_tokens,
            SUM(input_tokens)::int AS input_tokens, SUM(output_tokens)::int AS output_tokens,
            SUM(steps)::int AS steps, (AVG(elapsed_ms))::int AS avg_ms
       FROM assistant_runs`,
    [],
  );
  const named = (row: Record<string, unknown>): Record<string, unknown> => ({ ...row, who: userById(String(row['user_id']))?.name ?? String(row['user_id']) });

  return {
    totals: totals.rows[0] ?? { runs: 0, total_tokens: 0, input_tokens: 0, output_tokens: 0, steps: 0, avg_ms: 0 },
    runs: runs.rows.map(named),
    byPerson: byPerson.rows.map(named),
    byModel: byModel.rows,
    byAgent: byAgent.rows,
  };
};

// Who holds a shell, and what is on their screen right now — moss's own
// enumeration, put next to the people it names. The join is all this does: the
// seam serves shells, and only the app knows that `usr_3` is Rosa on the desk
// at the Meridien.
//
// `connections` is the fact this could not answer before and the one an
// operator asks first, because it separates the two cases that look identical
// from a support call: nobody is looking (the shell is warm and idle, and will
// be swept) versus three terminals are attached and one of them is the person
// telling you their screen is stuck.
const roster = (shells: ShellHost | undefined): unknown => {
  const now = Date.now();
  return {
    sessions: (shells?.list() ?? []).map((shell) => {
      const user = userById(shell.principal);
      return {
        principal: shell.principal,
        username: user?.username ?? '',
        name: user?.name ?? shell.principal,
        audience: user?.audience ?? '',
        property: user?.propertyName ?? '',
        canvases: shell.canvases,
        mounted: shell.canvases.reduce((total, canvas) => total + canvas.actions.length, 0),
        connections: shell.connections,
        ageMs: now - shell.since,
        idleMs: shell.idleSince === null ? 0 : now - shell.idleSince,
      };
    }),
  };
};

const startedAt = Date.now();

const health = async (app: NiscApp, runtime: DevRuntime, shells: ShellHost | undefined): Promise<unknown> => {
  const ids = Object.keys(app.actions);
  const entries = await runtime.pool.query('SELECT count(*)::int AS n FROM vex_cache', []);
  const living = shells?.list() ?? [];
  return {
    startedAt,
    uptimeMs: Date.now() - startedAt,
    actions: { core: ids.filter((id) => !id.startsWith('ext.')).length, ext: ids.filter((id) => id.startsWith('ext.')).length },
    entries: { cached: Number(entries.rows[0]?.['n'] ?? 0), bundled: bundleState.entries.length },
    shells: living.length,
    // Held but unattended — the shells the idle sweep is there for. Worth its
    // own figure: a count of shells says nothing about whether the process is
    // holding state anybody is using.
    idle: living.filter((shell) => shell.connections === 0).length,
    sync: lastSync,
  };
};

// ─── the writes ──────────────────────────────────────────────
// All three are the same move the go-live path already makes: write rows, run
// the resolver, refresh the running server. `refreshServer` re-reads the
// bundle rows into the live manifest, re-verifies the charter over them and
// walks every living shell so it adopts in place — which is why a withdrawal
// reaches a guest holding their phone without anybody reloading anything.
const resolveAndRefresh = async (runtime: DevRuntime, connectorId?: string): Promise<void> => {
  for (const statement of resolveStatements(connectorId)) await runtime.pool.query(statement, []);
  await refreshServer();
};

// ─── mounting ────────────────────────────────────────────────

export const mountOperator = (server: MossServer, runtime: DevRuntime, app: NiscApp): void => {
  // The key is the whole gate, and an unset key means the seam does not exist:
  // a deployment that never sets OPERATOR_KEY answers 404 to every path below,
  // which is the correct posture for a surface nobody outside our company is
  // ever meant to find.
  server.use('/operator/*', async (c, next) => {
    if (operatorKey() === '') return c.json({ message: 'Not found.' }, 404);
    if (!keyMatches(c.req.header('x-operator-key') ?? '')) return c.json({ message: 'Not found.' }, 404);
    return next();
  });

  server.get('/operator/actors', (c) => c.json(actors() as Record<string, unknown>));
  server.get('/operator/charter', (c) => c.json(charterReport(app) as Record<string, unknown>));
  server.get('/operator/actions', async (c) => c.json((await actionsReport(app, runtime)) as Record<string, unknown>));
  server.get('/operator/surface', async (c) => c.json((await surfaceReport(runtime)) as Record<string, unknown>));
  server.get('/operator/config', async (c) => c.json((await configReport(runtime)) as Record<string, unknown>));
  // ONE action, whole — layout included. The list route above deliberately does
  // not carry layouts (forty definitions with their trees is a payload nobody
  // asked for), so inspecting one is its own request. This is what makes a
  // layout previewable: the tool receives the same JSON the shell renders from,
  // and renders it.
  server.get('/operator/action/:id', async (c) => {
    const id = c.req.param('id');
    const definition = app.actions[id];
    if (definition === undefined) return c.json({ message: 'No such action.' }, 404);
    const rows = await runtime.pool.query('SELECT connector_id FROM bundle_actions WHERE id = $1', [id]);
    return c.json({ id, source: String(rows.rows[0]?.['connector_id'] ?? 'core'), definition });
  });

  server.get('/operator/entries', async (c) => c.json((await entriesReport(app, runtime)) as Record<string, unknown>));
  server.get('/operator/timeline', (c) => c.json(timelineReport() as Record<string, unknown>));
  server.get('/operator/runs', async (c) => c.json((await runsReport(runtime)) as Record<string, unknown>));
  server.get('/operator/roster', (c) => c.json(roster(server.shells) as Record<string, unknown>));
  server.get('/operator/health', async (c) => c.json((await health(app, runtime, server.shells)) as Record<string, unknown>));

  // ─── the one write that touches a person's session ───────────
  //
  // Restart one principal's shell. Their terminals stay connected, stay signed
  // in, and receive a fresh frame — the screen boot would serve them now, with
  // whatever they had navigated into gone. That last part is the whole cost
  // and it should be said plainly rather than dressed up: this is not a repair
  // that preserves what someone was doing, it is the way to end a session that
  // has stopped working without asking them to sign out of an interface too
  // broken to sign out of.
  //
  // It writes no row and reads no data. What it can do is bounded by what a
  // shell IS — a warm cache over the projection — so the worst outcome of
  // firing it at the wrong person is that they see their home screen.
  server.post('/operator/shell/reset', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { principal?: string };
    if (typeof body.principal !== 'string' || body.principal === '') {
      return c.json({ message: 'A shell reset names a principal.' }, 400);
    }
    if (server.shells === undefined) return c.json({ message: 'This server holds no shells.' }, 404);
    // `false` means they hold no shell — not an error, and the honest answer to
    // "restart Rosa's" when Rosa went home. Saying so beats a 404 that reads
    // like the seam is missing.
    const reset = server.shells.reset(body.principal);
    return c.json({ principal: body.principal, reset });
  });

  // Withdraw or restore a surface, estate-wide. One row, then the resolver.
  server.post('/operator/slot', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { slotId?: string; enabled?: boolean };
    if (typeof body.slotId !== 'string' || typeof body.enabled !== 'boolean') {
      return c.json({ message: 'A slot write names slotId and enabled.' }, 400);
    }
    const updated = await runtime.pool.query('UPDATE surface_slots SET enabled = $2 WHERE id = $1 RETURNING id', [body.slotId, body.enabled]);
    if (updated.rows.length === 0) return c.json({ message: 'No such slot.' }, 404);
    await resolveAndRefresh(runtime);
    return c.json({ slotId: body.slotId, enabled: body.enabled });
  });

  // The two capability switches the app already owns, reachable from here so
  // the tool can do in one place what the vendor console and the ops pane each
  // do for their own half.
  server.post('/operator/capability', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { connectorId?: string; propertyId?: string; capabilityId?: string; enabled?: boolean };
    if (typeof body.capabilityId !== 'string' || typeof body.enabled !== 'boolean') {
      return c.json({ message: 'A capability write names capabilityId and enabled.' }, 400);
    }
    if (typeof body.connectorId === 'string' && body.connectorId !== '') {
      await runtime.pool.query('UPDATE connector_capabilities SET enabled = $3 WHERE connector_id = $1 AND capability_id = $2', [body.connectorId, body.capabilityId, body.enabled]);
      await resolveAndRefresh(runtime, body.connectorId);
      return c.json({ connectorId: body.connectorId, capabilityId: body.capabilityId, enabled: body.enabled });
    }
    if (typeof body.propertyId === 'string' && body.propertyId !== '') {
      await runtime.pool.query('UPDATE property_capabilities SET enabled = $3 WHERE property_id = $1 AND capability_id = $2', [body.propertyId, body.capabilityId, body.enabled]);
      await resolveAndRefresh(runtime);
      return c.json({ propertyId: body.propertyId, capabilityId: body.capabilityId, enabled: body.enabled });
    }
    return c.json({ message: 'A capability write names a connectorId or a propertyId.' }, 400);
  });

  // Pull the bundles again — the same discovery path boot runs, on demand.
  server.post('/operator/sync', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { connectorId?: string };
    const reports = await syncIntegrations(runtime, body.connectorId === undefined || body.connectorId === '' ? undefined : body.connectorId);
    return c.json({ reports });
  });
};
