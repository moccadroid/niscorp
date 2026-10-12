import { mintDevToken } from '@niscorp/moss';
import type { NiscRuntime } from '@niscorp/moss';
import { ASSIGNMENTS } from '@atrium/app/charter/assignments';

export type CastEntry = { id: string; username: string; blurb: string; hidden?: boolean };

export const CAST: readonly CastEntry[] = [
  { id: 'gst_amara', username: 'amara', blurb: 'In house at The Lumen, room 412, night three of five — and the air conditioning has kept her awake twice.' },
  { id: 'gst_theo', username: 'theo', blurb: 'Arriving at five, asking about a junior suite. A pre-arrival shell is a different application.' },
  { id: 'gst_ines', username: 'ines', blurb: 'In house at Casa Marisol — a different PMS. Spa instead of a key, and no online check-in.' },
  { id: 'stf_rosa', username: 'rosa', blurb: 'Front office at The Lumen, mid-shift: three guests waiting on an answer, two faults nobody is on, and a wedding party due at half four.' },
  { id: 'stf_pilar', username: 'pilar', blurb: 'Front office at Casa Marisol. The same desk over a different hotel — a spa diary instead of a call sheet.' },
  { id: 'stf_kwame', username: 'kwame', blurb: 'Maintenance at The Lumen. Three big targets on a phone, nothing else.' },
  { id: 'stf_henrik', username: 'henrik', blurb: 'Operations for both houses. One person, one principal per property — the chrome switches, the boundary holds.' },
  { id: 'stf_henrik_m', username: 'henrik.marisol', blurb: 'Henrik at Casa Marisol.', hidden: true },
  { id: 'usr_vendor', username: 'atrium', blurb: 'Us. Connectors, capabilities, and the checklist that ships a feature to every property at once.' },
];

// One human, two single-tenant principals.
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
  layoutControl?: string;
};

const directory = new Map<string, Directory>();

const audienceOf = (id: string): Directory['audience'] => {
  const role = ASSIGNMENTS[id]?.[0];
  if (role === 'guest' || role === 'desk' || role === 'service' || role === 'ops' || role === 'vendor') return role;
  throw new Error(`directory: principal "${id}" wears no audience role in the charter's assignments`);
};

// Runs at boot before any session is built: the synchronous `inputs` and `scope` hooks read it.
export const loadDirectory = async (pool: NiscRuntime['pool']): Promise<void> => {
  directory.clear();
  const cast = new Map(CAST.map((c) => [c.id, c]));

  // The current stay is the latest arrival, the same rule the `stay/current` read uses.
  const guests = await pool.query(
    `SELECT g.id, g.name, g.property_id, p.name AS property_name, p.accent, s.id AS stay_id
     FROM guests g
     JOIN properties p ON p.id = g.property_id
     LEFT JOIN (SELECT DISTINCT ON (guest_id) guest_id, id FROM stays ORDER BY guest_id, arrival DESC) s ON s.guest_id = g.id`,
    [],
  );
  for (const row of guests.rows) {
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

export const people = (): { id: string; username: string; name: string; blurb: string; audience: string }[] =>
  CAST.filter((c) => c.hidden !== true).map((c) => {
    const d = directory.get(c.id);
    return { id: c.id, username: c.username, name: d?.name ?? c.username, blurb: c.blurb, audience: d?.audience ?? 'guest' };
  });

// Needs only CAST, so the token script works without booting a database.
export const mintToken = (username: string): string | null => {
  const wanted = username.trim().toLowerCase();
  const entry = CAST.find((c) => c.username === wanted);
  if (entry === undefined) return null;
  return mintDevToken(entry.id);
};
