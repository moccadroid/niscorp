import type { ExecuteAs } from '@niscorp/moss';

// ═══════════════════════════════════════════════════════════════
// THE LAB'S SIGN-IN TRANSPORT — anonymity choosing who to be.
//
// The picker offers the cast so a developer can BE somebody with one click:
// the same path a mailed link takes, with the delivery step replaced by a
// choice. It answers only when `LYRA_DEV_LOGIN` is on — a deployment never
// sets it — and `identity-check` asserts both states on the anonymous shell.
//
// It reads through the ENGINE, as the charter's `transport` role: two seeded
// entries (staff, then anchors — the resolver's reverse joins are INNER, so
// one entry cannot walk both), merged here with the staff word winning.
// Automation rows never appear: a robot is not somebody you can be.
// ═══════════════════════════════════════════════════════════════

export type DevLoginRow = { id: string; name: string; email: string; studio: string; role: string };

export const readDevLoginRoster = async (runAs: ExecuteAs): Promise<DevLoginRow[]> => {
  if (process.env['LYRA_DEV_LOGIN'] !== 'on') return [];
  const staff = await runAs('transport', 'transport/staff-roster', {});
  const members = await runAs('transport', 'transport/member-roster', {});

  const byId = new Map<string, DevLoginRow>();
  if (Array.isArray(members)) {
    for (const row of members as { person_id?: unknown; name?: unknown; email?: unknown; studio?: unknown }[]) {
      byId.set(String(row.person_id ?? ''), { id: String(row.person_id ?? ''), name: String(row.name ?? ''), email: String(row.email ?? ''), studio: String(row.studio ?? ''), role: 'member' });
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
