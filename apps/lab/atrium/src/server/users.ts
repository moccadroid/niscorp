import { mintDevToken } from '@niscorp/moss';
import type { NiscRuntime } from '@niscorp/moss';
import { ASSIGNMENTS } from '@atrium/app/charter/assignments';

// The demo identity directory, split along the only honest line:
//
//   CAST      — authored content: how a principal signs in (username) and how
//               the login page describes them (blurb). Nothing factual.
//   directory — the FACTS: name, property, accent, current stay, job. Loaded
//               from the database at boot, because every one of them is already
//               a row (guests, stays, staff, properties) and a second copy in
//               code was the same sin as a hardcoded menu.
//
// The vendor is the one authored principal: we are the integrator, and our own
// identity is not hotel data.
//
// Roles are NOT here — they live in the charter's assignments. The audience IS
// the principal's role, read from there.
export type CastEntry = { id: string; username: string; blurb: string; hidden?: boolean };

export const CAST: readonly CastEntry[] = [
  { id: 'gst_amara', username: 'amara', blurb: 'In house at The Lumen, room 412, night three of five — and the air conditioning has kept her awake twice.' },
  { id: 'gst_theo', username: 'theo', blurb: 'Arriving at five, asking about a junior suite. A pre-arrival shell is a different application.' },
  { id: 'gst_ines', username: 'ines', blurb: 'In house at Casa Marisol — a different PMS. Spa instead of a key, and no online check-in.' },
  { id: 'stf_rosa', username: 'rosa', blurb: 'Front office at The Lumen, mid-shift: three guests waiting on an answer, two faults nobody is on, and a wedding party due at half four.' },
  { id: 'stf_pilar', username: 'pilar', blurb: 'Front office at Casa Marisol. The same desk over a different hotel — a spa diary instead of a call sheet.' },
  { id: 'stf_kwame', username: 'kwame', blurb: 'Maintenance at The Lumen. Three big targets on a phone, nothing else.' },
  { id: 'stf_henrik', username: 'henrik', blurb: 'Operations for both houses. One person, one principal per property — the chrome switches, the boundary holds.' },
  // Henrik's Marisol principal. Hidden from the login page — one HUMAN signs in
  // once; the chrome's switcher re-grants between his two single-tenant selves.
  { id: 'stf_henrik_m', username: 'henrik.marisol', blurb: 'Henrik at Casa Marisol.', hidden: true },
  { id: 'usr_vendor', username: 'atrium', blurb: 'Us. Connectors, capabilities, and the checklist that ships a feature to every property at once.' },
];

// One human, two single-tenant principals. The chrome reads the sibling to
// offer the switch; auth.switchProperty re-grants across it.
export const SIBLINGS: Record<string, string> = {
  stf_henrik: 'stf_henrik_m',
  stf_henrik_m: 'stf_henrik',
};

export type Directory = {
  id: string;
  username: string;
  name: string;
  blurb: string;
  audience: 'guest' | 'desk' | 'service' | 'ops' | 'vendor';
  propertyId: string;
  propertyName: string;
  accent: string;
  stayId?: string;
  staffId?: string;
  job?: string;
  // How much of this person's screen the assistant may place — a row on `staff`,
  // so one clerk moves to full assistant control without a deploy.
  layoutControl?: string;
};

const directory = new Map<string, Directory>();

// The audience is the principal's charter role — the roles ARE the audiences.
const audienceOf = (id: string): Directory['audience'] => {
  const role = ASSIGNMENTS[id]?.[0];
  if (role === 'guest' || role === 'desk' || role === 'service' || role === 'ops' || role === 'vendor') return role;
  throw new Error(`directory: principal "${id}" wears no audience role in the charter's assignments`);
};

// Load the facts from the database. Runs once at boot, before any session is
// built — the sync `inputs`/`scope` hooks then read this snapshot. The seed is
// the single source; this is a projection of it, not a second authoring.
export const loadDirectory = async (pool: NiscRuntime['pool']): Promise<void> => {
  directory.clear();
  const cast = new Map(CAST.map((c) => [c.id, c]));

  // Guests, with their property and CURRENT stay (latest arrival — the same
  // rule the stay/current read uses).
  const guests = await pool.query(
    `SELECT g.id, g.name, g.property_id, p.name AS property_name, p.accent, s.id AS stay_id
     FROM guests g
     JOIN properties p ON p.id = g.property_id
     LEFT JOIN (SELECT DISTINCT ON (guest_id) guest_id, id FROM stays ORDER BY guest_id, arrival DESC) s ON s.guest_id = g.id`,
    [],
  );
  for (const row of guests.rows) {
    const c = cast.get(String(row['id']));
    if (c === undefined) continue; // a guest with no login is just a guest
    directory.set(c.id, {
      id: c.id,
      username: c.username,
      blurb: c.blurb,
      name: String(row['name']),
      audience: audienceOf(c.id),
      propertyId: String(row['property_id']),
      propertyName: String(row['property_name']),
      accent: String(row['accent']),
      stayId: String(row['stay_id'] ?? ''),
    });
  }

  const staff = await pool.query(
    `SELECT st.id, st.name, st.job, st.layout_control, st.property_id, p.name AS property_name, p.accent
     FROM staff st
     JOIN properties p ON p.id = st.property_id`,
    [],
  );
  for (const row of staff.rows) {
    const c = cast.get(String(row['id']));
    if (c === undefined) continue;
    directory.set(c.id, {
      id: c.id,
      username: c.username,
      blurb: c.blurb,
      name: String(row['name']),
      audience: audienceOf(c.id),
      propertyId: String(row['property_id']),
      propertyName: String(row['property_name']),
      accent: String(row['accent']),
      staffId: c.id,
      job: String(row['job']),
      layoutControl: String(row['layout_control'] ?? 'mixed'),
    });
  }

  // The vendor — authored, because our own identity is not hotel data.
  const vendor = cast.get('usr_vendor');
  if (vendor !== undefined) {
    directory.set(vendor.id, {
      id: vendor.id,
      username: vendor.username,
      blurb: vendor.blurb,
      name: 'Atrium Integrations',
      audience: 'vendor',
      propertyId: 'prop_lumen',
      propertyName: 'all properties',
      accent: 'sage',
    });
  }
};

export const userById = (id: string | null): Directory | undefined => (id === null ? undefined : directory.get(id));

export const userByUsername = (username: string): Directory | undefined => {
  const wanted = username.trim().toLowerCase();
  for (const entry of directory.values()) if (entry.username === wanted) return entry;
  return undefined;
};

// The login page's people — cast content plus the loaded name and audience.
// Hidden entries (a sibling principal) are real logins but not login-page rows.
export const people = (): { id: string; username: string; name: string; blurb: string; audience: string }[] =>
  CAST.filter((c) => c.hidden !== true).map((c) => {
    const d = directory.get(c.id);
    return { id: c.id, username: c.username, name: d?.name ?? c.username, blurb: c.blurb, audience: d?.audience ?? 'guest' };
  });

// The dev mint — needs only the CAST (username → principal id), so the token
// script works without booting a database. Real auth replaces the mint, not
// this seam.
export const mintToken = (username: string): string | null => {
  const wanted = username.trim().toLowerCase();
  const entry = CAST.find((c) => c.username === wanted);
  if (entry === undefined) return null;
  return mintDevToken(entry.id);
};
