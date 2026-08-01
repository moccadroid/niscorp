import { z } from 'zod';
import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import { resolveStatements } from '@atrium/db/resolve';
import { refreshServer, syncIntegrations } from '@atrium/server/bundles';

// The integration seam. Two handlers, and the difference between them is the
// whole point of running connectors as their own service.
//
//   `connector.issueKey` — talks to a SEPARATE PROCESS over HTTP. New PMS
//     integrations deploy on their own clock, and if one is unreachable the main
//     app keeps serving: the guest gets a sentence and our database does not
//     record a credential that was never cut.
//
//   `connector.resync`   — recomputes the resolved layer in our own database.
//     This is the deployment: no process restarts. It does NOT push to other
//     shells — the database is now correct, and every shell reads the resolved
//     surface fresh on its next mount/resume. Liveness is best-effort by
//     design; correctness is the DB.
//
// The connector service being separate is what makes "our main app never goes
// down" true rather than aspirational: shipping Opera v3 is a deploy of a
// process that this one only ever calls.

const CONNECTOR_TIMEOUT_MS = 2500;

// Rule 13: a fn payload crosses a boundary, so it is parsed, not cast. Zod
// strips keys it does not name — the whole action-data blob narrows to what
// each handler actually uses.
const KeyPayload = z.object({ stayId: z.string().optional(), keyStayId: z.string().optional() });
const ResyncPayload = z.object({ selected: z.object({ connector_id: z.string().optional() }).optional() });

export const connectorFunctions = (session: FunctionSession): Record<string, FunctionHandler> => ({
  // Cut a door credential. `stayId` comes from the action's data, which lives in
  // the server's shell — a terminal cannot forge it.
  'connector.issueKey': async (data) => {
    const payload = KeyPayload.parse(data);
    const stayId = payload.stayId ?? payload.keyStayId ?? '';
    if (stayId === '') throw new Error('No stay to cut a key for.');

    const rows = await session.runtime.pool.query(
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
      // A connector that is down is an ordinary condition, not a crash. The
      // caller shows the sentence and writes nothing.
      const reason = error instanceof Error && error.name === 'AbortError' ? 'it did not answer in time' : error instanceof Error ? error.message : 'it is unreachable';
      throw new Error(`The ${String(row['connector_name'])} door service could not cut a key — ${reason}. Nothing was charged and no key was issued.`);
    } finally {
      clearTimeout(timer);
    }
  },

  // THE deployment step, now with the pull in front: fetch the connector's
  // current /bundle through intake (a go-live picks up whatever the vendor
  // shipped since), then recompute what is live and refresh the running
  // server — bundle actions re-load from rows, memos drop, and every living
  // shell adopts the re-resolved definitions in place. A guest holding their
  // phone in the lobby sees a tile arrive without touching anything.
  //
  // The pull is best-effort ON PURPOSE: a switch flip must resolve even when
  // the service is unreachable (the rows it flipped are ours), so refusals
  // and downtime are reported in the result, never thrown.
  'connector.resync': async (data) => {
    // Scope the resync to the shipped connector when the console names one;
    // a property-level toggle resolves the whole estate.
    const connectorId = ResyncPayload.parse(data).selected?.connector_id ?? '';
    const scoped = connectorId === '' ? undefined : connectorId;
    const reports = await syncIntegrations(session.runtime, scoped);
    for (const statement of resolveStatements(scoped)) await session.runtime.pool.query(statement, []);
    await refreshServer();
    // The console renders this: what each connector's service said. A refusal
    // is a row here and old rows on disk — never a thrown call, because the
    // switch flip itself succeeded.
    return reports.map((r) => ({ connector: r.connector, ok: r.ok, detail: r.ok ? 'bundle pulled and validated' : r.reasons.join(' · ') }));
  },
});
