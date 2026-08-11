import { mintDevToken } from '@niscorp/moss';
import type { PgPool } from '@niscorp/vex';

// WHO SOMEBODY IS — read from the database at boot, held as a snapshot, and
// consulted by the manifest's `scope` and `inputs` hooks.
//
// Two reasons it is a snapshot rather than a query. `scope(principal)` is
// synchronous by contract (moss calls it while compiling a request's scope
// values), and it is asked on a hot path. Neither is a place for a round trip.
// The cost is that a person who joins mid-process is invisible until the
// directory reloads — acceptable while `loadDirectory` is a boot step, and the
// reason `reload` exists at all.
//
// Nothing here is authorisation. This says a principal belongs to Lumen and
// wears the owner role; whether that role may read a member is the charter's
// answer, and whether THIS row is theirs is the engine's.

export type Audience = 'owner' | 'manager' | 'instructor' | 'desk' | 'member' | 'automation' | 'integration';

export type Person = {
  id: string;
  email: string;
  name: string;
  studioId: string;
  studioName: string;
  audience: Audience;
  staffId: string | null;
  membershipId: string | null;
};

let DIRECTORY: Record<string, Person> = {};
// Each studio's timezone, loaded with the directory. The one place the JS half
// of the clock reads from.
const TIMEZONES: Record<string, string> = {};
let BY_EMAIL: Record<string, Person> = {};

// Staff beats membership when someone is both. Tobias teaches and trains; the
// screen he lands on is the instructor's, and his own membership is a thing he
// can look at rather than the lens he sees the studio through.
// An automation is an audience like any other, which is what lets the charter
// govern it. A role the charter does not name still resolves to 'member' — the
// safe direction, asserted in acl-check.
const AUDIENCE_OF: Record<string, Audience> = { owner: 'owner', manager: 'manager', instructor: 'instructor', desk: 'desk', automation: 'automation' };

/** A staff role as the charter's audience. Anything unrecognised lands on the
 *  bottom rung — the charter THROWS on a role it does not know, so resolving
 *  downward has to happen here, before it ever sees one. */
export const audienceOf = (role: string): Audience => AUDIENCE_OF[role] ?? 'member';

/**
 * EVERY role a person holds, not one.
 *
 * This returned a single word: the staff role if there was a staff row, else
 * 'member'. The schema splits `staff` and `memberships` into two tables for a
 * stated reason — a person can be staff at a studio and hold a membership there
 * too — and this flattened exactly that apart back together, so an instructor
 * who trains stopped being a member the moment the charter looked at them.
 *
 * Three workarounds grew on top of it: an extra scoping profile so a teacher
 * could book a class, a projection table, and a deny that was never needed. All
 * three go away by telling the truth here.
 */
export const rolesOf = (person: { audience: string; membershipId: string | null }): readonly string[] => {
  const roles: string[] = [];
  if (person.audience !== 'member') roles.push(person.audience);
  // Holding a membership IS the member role. It is not a rung below staff; it
  // is a different relationship with the studio, and plenty of people have both.
  if (person.membershipId !== null) roles.push('member');
  return roles.length > 0 ? roles : ['member'];
};

// WHICH INTEGRATIONS EACH STUDIO HAS INSTALLED.
//
// Loaded beside the directory and for the same reason: moss asks per request
// and a query per request would be a query per request. Reloaded when the
// directory reloads, which is a boot step today.
const INSTALLED: Record<string, string[]> = {};

/** Integration ids live for whoever this principal is. Empty for anonymous. */
export const installedFor = (principal: string | null): readonly string[] => {
  if (principal === null) return [];
  const person = personById(principal);
  return person === undefined ? [] : (INSTALLED[person.studioId] ?? []);
};

export const loadDirectory = async (pool: PgPool): Promise<void> => {
  for (const key of Object.keys(INSTALLED)) delete INSTALLED[key];
  const installs = await pool.query('SELECT studio_id, integration_id FROM studio_integrations WHERE enabled = true');
  for (const raw of installs.rows) {
    const row = raw as { studio_id: string; integration_id: string };
    (INSTALLED[row.studio_id] ??= []).push(row.integration_id);
  }

  // EVERY studio, not just the ones with people on the roll.
  //
  // These were read off the person join, so a studio nobody had joined yet was
  // absent from the cache and  fell back to UTC for it — quietly,
  // which is the exact failure mode this clock work exists to remove. A brand
  // new studio is the most likely one to have nobody in it.
  const zones = await pool.query('SELECT id, name, timezone FROM studios');
  const studioNames: Record<string, string> = {};
  for (const zone of zones.rows as { id: string; name: string; timezone: string }[]) {
    TIMEZONES[zone.id] = zone.timezone;
    studioNames[zone.id] = zone.name;
  }

  const result = await pool.query(/* sql */ `
    SELECT
      p.id, p.email, p.name,
      COALESCE(sf.studio_id, mb.studio_id) AS studio_id,
      st.name  AS studio_name,
      sf.role  AS staff_role,
      sf.id    AS staff_id,
      mb.id    AS membership_id
    FROM people p
    LEFT JOIN staff sf       ON sf.person_id = p.id AND sf.active
    LEFT JOIN memberships mb ON mb.person_id = p.id
    LEFT JOIN studios st     ON st.id = COALESCE(sf.studio_id, mb.studio_id)
    WHERE COALESCE(sf.studio_id, mb.studio_id) IS NOT NULL
  `);

  const directory: Record<string, Person> = {};
  const byEmail: Record<string, Person> = {};
  for (const row of result.rows) {
    const staffRole = row['staff_role'] === null || row['staff_role'] === undefined ? '' : String(row['staff_role']);
    const person: Person = {
      id: String(row['id']),
      email: String(row['email']),
      name: String(row['name']),
      studioId: String(row['studio_id']),
      studioName: String(row['studio_name'] ?? ''),
      audience: audienceOf(staffRole),
      staffId: row['staff_id'] === null || row['staff_id'] === undefined ? null : String(row['staff_id']),
      membershipId: row['membership_id'] === null || row['membership_id'] === undefined ? null : String(row['membership_id']),
    };
    directory[person.id] = person;
    byEmail[person.email.toLowerCase()] = person;
  }

  // THE INTEGRATION ACTORS — one principal per installed (integration × studio),
  // derived from the install rows the way the automation principals are seeded.
  //
  // An integration acting with its key — a webhook landing, a nightly sync —
  // acts as one of these, never as the automation: its own audience means its
  // own charter rung, so revoking what an integration may write touches nothing
  // else. Derived rather than inserted, because an actor IS the install: it
  // exists exactly as long as the studio has the integration, and uninstalling
  // is what deletes it.
  for (const [studioId, integrations] of Object.entries(INSTALLED)) {
    for (const integrationId of integrations) {
      const id = integrationActorId(integrationId, studioId);
      directory[id] = {
        id,
        email: `${integrationId}@integrations.${studioId}`,
        name: `${integrationId} (integration)`,
        studioId,
        studioName: studioNames[studioId] ?? '',
        audience: 'integration',
        staffId: null,
        membershipId: null,
      };
    }
  }

  DIRECTORY = directory;
  BY_EMAIL = byEmail;
};

// Derived, never stored: the actor id names its two halves, and either half
// disappearing (uninstall, removal) takes the principal with it on the next
// directory load.
const integrationActorId = (integration: string, studioId: string): string => `ig_${integration}@${studioId}`;

/** The principal an integration acts as at this studio — or null, which is a
 *  refusal: no install, no actor, and the keyed call dies at the door. */
export const integrationActorFor = (integration: string, studioId: string): string | null => {
  const id = integrationActorId(integration, studioId);
  return DIRECTORY[id] === undefined ? null : id;
};

// THE STUDIO'S OWN DAY.
//
// Every read that means "today" now asks for THIS, engine-injected beside
// `studioId`, rather than a date the caller supplies. Two reasons, and the
// second is the important one:
//
//   • it is the studio's clock, not the server's — a studio in Auckland has a
//     Tuesday that starts thirteen hours before the server's, and "tomorrow's
//     classes" means tomorrow THERE;
//   • it is UNFORGEABLE. A scope value is stamped by the engine, so nobody can
//     ask for another day's roster by sending a different date, and no action
//     has to seed it — which is the dead-binding trap `inputs` sets and that
//     this application has walked into three times.
//
// The database computes the same value with `studio_today()` for its triggers.
// One definition, two consumers: this is the JS half.
export const studioToday = (studioId: string): string => {
  // NO STUDIO MEANS NO DAY.
  //
  // This fell through to UTC for an unknown studio, which is the failure mode
  // this whole clock exercise exists to remove: an answer that is plausible,
  // usually right, and silently wrong for somebody. An anonymous principal has
  // no timetable, so the honest value is EMPTY — a filter on it matches
  // nothing, which is the correct answer to "what is on today at your studio"
  // when there is no your-studio.
  if (studioId === '') return '';
  const timezone = TIMEZONES[studioId] ?? 'UTC';
  // `en-CA` because it formats as YYYY-MM-DD, which is what a DATE column
  // compares against. Doing this with an offset calculation is how a calendar
  // ends up a day out twice a year.
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
};

/** The last day a read looks ahead to — the studio's day plus four weeks. */
export const studioHorizon = (studioId: string): string => {
  const today = studioToday(studioId);
  if (today === '') return '';
  return new Date(Date.parse(`${today}T00:00:00Z`) + 27 * 86_400_000).toISOString().slice(0, 10);
};

export const personById = (principal: string | null): Person | undefined => (principal === null ? undefined : DIRECTORY[principal]);
export const personByEmail = (email: string): Person | undefined => BY_EMAIL[email.trim().toLowerCase()];
export const everyone = (): Person[] => Object.values(DIRECTORY);

// ─── the credential ──────────────────────────────────────────
//
// A magic link is the only way in (PLAN.md): there is no password field in this
// application and there is not going to be one. What a link carries is a
// session token, and in the lab that token is moss's dev token — minted here,
// verified by the runtime's default verifier.
//
// The real thing replaces this function and the runtime's `session` verifier
// TOGETHER, and nothing else in the app touches token mechanics. What does NOT
// change when it does: the token is still a bearer credential handed to a
// person, so it belongs in a link somebody clicks, never in a URL that gets
// shared, logged or shoulder-read. That is a lab posture and it is recorded as
// one.
export const mintToken = (email: string): string | null => {
  const person = personByEmail(email);
  return person === undefined ? null : mintDevToken(person.id);
};
