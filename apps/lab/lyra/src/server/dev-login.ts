import type { ExecuteAs } from '@niscorp/moss';

export type DevLoginRow = { id: string; name: string; email: string; studio: string; role: string };

export const readDevLoginRoster = async (runAs: ExecuteAs): Promise<DevLoginRow[]> => {
  if (process.env['LYRA_DEV_LOGIN'] !== 'on') return [];
  const staff = await runAs('transport', 'transport/staff-roster', {});
  const members = await runAs('transport', 'transport/member-roster', {});

  const byId = new Map<string, DevLoginRow>();
  if (Array.isArray(members)) {
    for (const row of members as { person_id?: unknown; name?: unknown; email?: unknown; studio?: unknown }[]) {
      if (row.email === null || row.email === undefined || row.email === '') continue;
      byId.set(String(row.person_id ?? ''), { id: String(row.person_id ?? ''), name: String(row.name ?? ''), email: String(row.email), studio: String(row.studio ?? ''), role: 'member' });
    }
  }
  if (Array.isArray(staff)) {
    for (const row of staff as { person_id?: unknown; name?: unknown; email?: unknown; studio?: unknown; role?: unknown }[]) {
      const role = String(row.role ?? '');
      if (role === 'automation') continue;
      byId.set(String(row.person_id ?? ''), { id: String(row.person_id ?? ''), name: String(row.name ?? ''), email: String(row.email ?? ''), studio: String(row.studio ?? ''), role });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
};
