import { timingSafeEqual } from 'node:crypto';
import type { MossServer, NiscApp, FunctionSession, ShellHost } from '@niscorp/moss';
import { CHARTER, ASSIGNMENTS } from '@atrium/app/charter';
import { resolveStatements } from '@atrium/db/resolve';
import { bundleState, lastSync, refreshServer, syncIntegrations } from '@atrium/server/bundles';
import { userById } from '@atrium/server/users';
import type { DevRuntime } from './runtime';

const operatorKey = (): string => process.env['OPERATOR_KEY'] ?? '';

// Constant-time, length difference included: a short guess must not answer faster.
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

// Names and timings only: no request body, no response, no payload of any kind.
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
  if (session.principal === null) return;
  const principal = session.principal;

  // Deferred a microtask: `session.shell` throws until the build finishes, and this runs mid-build.
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

const actors = async (server: MossServer): Promise<unknown> => ({
  principals: await Promise.all(
    Object.keys(ASSIGNMENTS).map(async (id) => {
      const user = userById(id);
      const actions = (await server.catalogOf(id)).ids;
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
  ),
  anonymous: { actions: (await server.catalogOf(null)).ids },
});

const charterReport = (server: MossServer): unknown => {
  const report = server.charterReport();
  return {
    roles: report.perRole.map((role) => ({ role: role.role, actions: role.actions, data: role.data, issues: role.issues })),
    warnings: report.warnings.map((warning) => ({ rule: warning.rule, detail: warning.detail })),
    authored: CHARTER,
  };
};

const actionsReport = async (server: MossServer, runtime: DevRuntime): Promise<unknown> => {
  const rows = await runtime.pool.query('SELECT id, connector_id, audience FROM bundle_actions', []);
  const source = new Map(rows.rows.map((row) => [String(row['id']), String(row['connector_id'])]));
  return {
    actions: Object.entries(server.actions())
      .map(([id, definition]) => {
        const input = (definition.input as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
        return {
          id,
          title: definition.title ?? id,
          source: source.get(id) ?? 'core',
          audience: id.startsWith('ext.') ? (id.split('.')[1] ?? '') : (id.split('.')[0] ?? ''),
          preview: 'expanded' in input,
          input: Object.keys(input).sort(),
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
};

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

const fingerprintOf = (request: unknown): string | undefined => {
  const held = (request as Record<string, unknown> | null)?.['fingerprint'];
  return typeof held === 'string' ? held : undefined;
};

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

const shapeKeys = (shape: unknown): string[] => {
  const row = Array.isArray(shape) ? shape[0] : shape;
  return row !== null && typeof row === 'object' && !Array.isArray(row) ? Object.keys(row as Record<string, unknown>) : [];
};

const CONTEXT_KEY = /"\$context":"(\w+)"/g;

const entriesReport = async (app: NiscApp, server: MossServer, runtime: DevRuntime): Promise<unknown> => {
  const rows = await runtime.pool.query('SELECT fingerprint, connector_id FROM bundle_entries', []);
  const source = new Map(rows.rows.map((row) => [String(row['fingerprint']), String(row['connector_id'])]));

  const callers = new Map<string, { action: string; endpoint: string; url: string }[]>();
  for (const [actionId, definition] of Object.entries(server.actions())) {
    for (const [name, endpoint] of Object.entries((definition.endpoints ?? {}) as Record<string, Record<string, unknown>>)) {
      const fingerprint = fingerprintOf(endpoint['request']);
      if (fingerprint === undefined) continue;
      const list = callers.get(fingerprint) ?? [];
      list.push({ action: actionId, endpoint: name, url: String(endpoint['url'] ?? '') });
      callers.set(fingerprint, list);
    }
  }

  // Both sources: a sync seeds bundle entries into vex_cache without adding them to `app.entries`.
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

  const missing = [...callers.entries()]
    .filter(([fingerprint]) => !seeded.has(fingerprint))
    .map(([fingerprint, list]) => ({ fingerprint, callers: list }));

  return { entries, missing };
};

const timelineReport = (): unknown => ({ calls: [...timeline].reverse() });

// On the app's pool, not through vex: under vex a person reads only their own rows.
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

const health = async (server: MossServer, runtime: DevRuntime, shells: ShellHost | undefined): Promise<unknown> => {
  const ids = Object.keys(server.actions());
  const entries = await runtime.pool.query('SELECT count(*)::int AS n FROM vex_cache', []);
  const living = shells?.list() ?? [];
  return {
    startedAt,
    uptimeMs: Date.now() - startedAt,
    actions: { core: ids.filter((id) => !id.startsWith('ext.')).length, ext: ids.filter((id) => id.startsWith('ext.')).length },
    entries: { cached: Number(entries.rows[0]?.['n'] ?? 0), bundled: bundleState.entries.length },
    shells: living.length,
    idle: living.filter((shell) => shell.connections === 0).length,
    sync: lastSync,
  };
};

const resolveAndRefresh = async (runtime: DevRuntime, connectorId?: string): Promise<void> => {
  for (const statement of resolveStatements(connectorId)) await runtime.pool.query(statement, []);
  await refreshServer(runtime);
};

export const mountOperator = (server: MossServer, runtime: DevRuntime, app: NiscApp): void => {
  // An unset key or a wrong one answers 404: nobody outside is meant to find this surface.
  server.use('/operator/*', async (c, next) => {
    if (operatorKey() === '') return c.json({ message: 'Not found.' }, 404);
    if (!keyMatches(c.req.header('x-operator-key') ?? '')) return c.json({ message: 'Not found.' }, 404);
    return next();
  });

  server.get('/operator/actors', async (c) => c.json((await actors(server)) as Record<string, unknown>));
  server.get('/operator/charter', (c) => c.json(charterReport(server) as Record<string, unknown>));
  server.get('/operator/actions', async (c) => c.json((await actionsReport(server, runtime)) as Record<string, unknown>));
  server.get('/operator/surface', async (c) => c.json((await surfaceReport(runtime)) as Record<string, unknown>));
  server.get('/operator/config', async (c) => c.json((await configReport(runtime)) as Record<string, unknown>));
  server.get('/operator/action/:id', async (c) => {
    const id = c.req.param('id');
    const definition = server.actions()[id];
    if (definition === undefined) return c.json({ message: 'No such action.' }, 404);
    const rows = await runtime.pool.query('SELECT connector_id FROM bundle_actions WHERE id = $1', [id]);
    return c.json({ id, source: String(rows.rows[0]?.['connector_id'] ?? 'core'), definition });
  });

  server.get('/operator/entries', async (c) => c.json((await entriesReport(app, server, runtime)) as Record<string, unknown>));
  server.get('/operator/timeline', (c) => c.json(timelineReport() as Record<string, unknown>));
  server.get('/operator/runs', async (c) => c.json((await runsReport(runtime)) as Record<string, unknown>));
  server.get('/operator/roster', (c) => c.json(roster(server.shells) as Record<string, unknown>));
  server.get('/operator/health', async (c) => c.json((await health(server, runtime, server.shells)) as Record<string, unknown>));

  server.post('/operator/shell/reset', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { principal?: string };
    if (typeof body.principal !== 'string' || body.principal === '') {
      return c.json({ message: 'A shell reset names a principal.' }, 400);
    }
    if (server.shells === undefined) return c.json({ message: 'This server holds no shells.' }, 404);
    const reset = server.shells.reset(body.principal);
    return c.json({ principal: body.principal, reset });
  });

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

  server.post('/operator/sync', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { connectorId?: string };
    const reports = await syncIntegrations(runtime, body.connectorId === undefined || body.connectorId === '' ? undefined : body.connectorId);
    return c.json({ reports });
  });
};
