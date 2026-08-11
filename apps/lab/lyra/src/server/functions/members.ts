import { randomUUID } from 'node:crypto';
import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';

// SIGNING SOMEBODY UP — the one place this application uses the `fn:` seam for
// a write, and the reason is a limit rather than a preference.
//
// The mutation grammar sets literals and `$context` values. It cannot generate
// a key and cannot read back one the database generated, so a person and the
// membership that must reference them cannot be linked by any pair of authored
// statements. D4 permits a plain endpoint handler for exactly this.
//
// What this handler does NOT do is open the database. It mints an id and calls
// two ordinary vex entries over the SESSION'S OWN WIRE — the same surface a
// browser hits, under the same compiled policy. So:
//
//   • the statements stay authored, server-side and replay-only
//   • `studio_id` is still stamped by the engine, not by this code
//   • a desk at Lumen still cannot write a row into North Rock
//
// The fn's entire contribution is a UUID and an order. That is the smallest
// version of this escape hatch, and the difference matters: the alternative —
// two raw SQL inserts — would make this function the tenancy boundary.
// The resource matters: an entry is only replayable on an endpoint whose
// resource carries its tables. `people` has no endpoint of its own — it is
// reachable through `member` and through `staff`, which is what keeps a bare
// query over every human in the system undiscoverable.
const callOn = async (session: FunctionSession, url: string, fingerprint: string, context: Record<string, unknown>): Promise<unknown> => {
  const response = await session.wire(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fingerprint, context }),
  });
  if (!response.ok) {
    const detail: unknown = await response.json().catch(() => null);
    const message = detail !== null && typeof detail === 'object' && 'message' in detail ? String((detail as { message: unknown }).message) : `refused (${response.status})`;
    throw new Error(message);
  }
  return response.json();
};

const call = async (session: FunctionSession, fingerprint: string, context: Record<string, unknown>): Promise<unknown> => callOn(session, '/api/member/vex', fingerprint, context);
const callStaff = async (session: FunctionSession, fingerprint: string, context: Record<string, unknown>): Promise<unknown> => callOn(session, '/api/staff/vex', fingerprint, context);

export const memberFunctions = (session: FunctionSession): Record<string, FunctionHandler> => ({
  'members.create': async (data) => {
    const email = String(data['newEmail'] ?? '').trim().toLowerCase();
    const name = String(data['newName'] ?? '').trim();
    if (name === '') throw new Error('A name is needed.');
    if (email === '' || !email.includes('@')) throw new Error('That does not look like an email address.');

    // Somebody with this address may already exist — a former member, or a
    // person who is staff here and now also trains. Reusing the row is the
    // whole reason people and memberships are separate tables.
    const found = await call(session, 'people/byEmail', { email });
    const existing = found !== null && typeof found === 'object' && !Array.isArray(found) ? String((found as { person_id?: unknown }).person_id ?? '') : '';

    const personId = existing === '' ? randomUUID() : existing;
    if (existing === '') {
      await call(session, 'people/create', { personId, email, name, phone: String(data['newPhone'] ?? '').trim() });
    }

    // A membership id the caller also chooses, for the same reason: the desk
    // wants to open the record it just made, and nothing can read a generated
    // key back.
    const membershipId = randomUUID();
    try {
      await call(session, 'memberships/create', {
        membershipId,
        personId,
        status: String(data['newStatus'] ?? 'trialling'),
        // Where they came from, carried whether this is an enquiry or a
        // signature — so the channel that produced a member is still on the
        // row a year later.
        source: String(data['newSource'] ?? 'walk-in'),
        notes: String(data['newNotes'] ?? ''),
      });
    } catch (cause) {
      // One membership per person per studio is a database constraint, which
      // is the right place for it — but "duplicate key value violates unique
      // constraint memberships_studio_id_person_id_key" is not a sentence to
      // put in front of somebody standing at a counter. The rule is the
      // database's; the wording is ours.
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message.includes('memberships_studio_id_person_id_key')) {
        throw new Error(`${name} is already a member here. Open their record to change their status.`);
      }
      throw cause;
    }

    return { membershipId, personId, reused: existing !== '' };
  },
});

// PUTTING SOMEBODY ON STAFF — the same shape as signing a member up, and the
// same reason for existing: a new instructor is a person AND a staff row, and
// no pair of authored statements can link them without an id.
//
// It reuses the person when the address is known, which is what makes "the
// member who now teaches" a single human rather than two. Everything else is
// ordinary: two authored entries over the session's wire, the engine stamping
// the studio on both.
export const staffIntakeFunctions = (session: FunctionSession): Record<string, FunctionHandler> => ({
  'staff.create': async (data) => {
    const email = String(data['newEmail'] ?? '').trim().toLowerCase();
    const name = String(data['newName'] ?? '').trim();
    const role = String(data['newRole'] ?? 'instructor');
    if (name === '') throw new Error('A name is needed.');
    if (email === '' || !email.includes('@')) throw new Error('That does not look like an email address.');

    // The charter defines four roles and this rejects a fifth before it can
    // reach a column that would happily store it. The grant list is the
    // authority; this is the gate in front of the one write that names a role.
    if (!['owner', 'manager', 'instructor', 'desk'].includes(role)) throw new Error('That is not a role this studio has.');

    const found = await callStaff(session, 'people/byEmail', { email });
    const existing = found !== null && typeof found === 'object' && !Array.isArray(found) ? String((found as { person_id?: unknown }).person_id ?? '') : '';

    const personId = existing === '' ? randomUUID() : existing;
    if (existing === '') {
      await callStaff(session, 'people/create', { personId, email, name, phone: String(data['newPhone'] ?? '').trim() });
    }

    const staffId = randomUUID();
    try {
      await callStaff(session, 'staff/create', { staffId, personId, role });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message.includes('staff_studio_id_person_id_key')) {
        throw new Error(`${name} is already on staff here. Change their role below instead.`);
      }
      throw cause;
    }

    return { staffId, personId, reused: existing !== '' };
  },
});
