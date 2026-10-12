import { z } from 'zod';
import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession, NiscRuntime } from '@niscorp/moss';
import { resolveStatements } from '@atrium/db/resolve';
import { refreshServer, syncIntegrations } from '@atrium/server/bundles';

const CONNECTOR_TIMEOUT_MS = 2500;

const KeyPayload = z.object({ stayId: z.string().optional(), keyStayId: z.string().optional() });
const ResyncPayload = z.object({ selected: z.object({ connector_id: z.string().optional() }).optional() });

// These run on the app's own `runtime`, under no caller's policy, for whoever
// the charter grants the action that calls them.
export const connectorFunctions = (_session: FunctionSession, runtime: NiscRuntime): Record<string, FunctionHandler> => ({
  // `stayId` comes from the action's data in the server's shell: a terminal cannot forge it.
  'connector.issueKey': async (data) => {
    const payload = KeyPayload.parse(data);
    const stayId = payload.stayId ?? payload.keyStayId ?? '';
    if (stayId === '') throw new Error('No stay to cut a key for.');

    const rows = await runtime.pool.query(
      `SELECT s.external_id AS stay_ref, r.external_id AS room_ref, r.number AS room_number, c.service_url, c.name AS connector_name, c.live_version
       FROM stays s
       JOIN properties p ON p.id = s.property_id
       JOIN connectors c ON c.id = p.connector_id
       LEFT JOIN rooms r ON r.id = s.room_id
       WHERE s.id = $1`,
      [stayId],
    );
    const row = rows.rows[0];
    if (row === undefined) throw new Error('That stay is not in the system.');

    const url = `${String(row['service_url'])}/key`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONNECTOR_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stay: row['stay_ref'], room: row['room_ref'], version: row['live_version'] }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `${String(row['connector_name'])} refused the request.`);
      }
      const body = (await response.json()) as { credential?: string };
      return body.credential ?? '';
    } catch (error) {
      const reason = error instanceof Error && error.name === 'AbortError' ? 'it did not answer in time' : error instanceof Error ? error.message : 'it is unreachable';
      throw new Error(`The ${String(row['connector_name'])} door service could not cut a key — ${reason}. Nothing was charged and no key was issued.`);
    } finally {
      clearTimeout(timer);
    }
  },

  // The pull is best-effort: a switch flip must resolve even when the service is
  // unreachable, so refusals and downtime are reported in the result, never thrown.
  'connector.resync': async (data) => {
    const connectorId = ResyncPayload.parse(data).selected?.connector_id ?? '';
    const scoped = connectorId === '' ? undefined : connectorId;
    const reports = await syncIntegrations(runtime, scoped);
    for (const statement of resolveStatements(scoped)) await runtime.pool.query(statement, []);
    await refreshServer(runtime);
    return reports.map((r) => ({ connector: r.connector, ok: r.ok, detail: r.ok ? 'bundle pulled and validated' : r.reasons.join(' · ') }));
  },
});
