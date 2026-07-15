// Who wears which roles — the stand-in for the assignment table
// ({ principal, role, expires, grantedBy, reason } rows once the server
// exists). Principals are auth users (src/auth/users.ts); role names are
// charter keys. usr_003 wears admin WITHOUT dev on purpose — roles are
// orthogonal, admin does not imply devtools.
export const ASSIGNMENTS: Record<string, readonly string[]> = {
  usr_001: ['sales', 'dev'],
  usr_002: ['viewer'],
  usr_003: ['admin'],
};

// An unassigned (or anonymous) principal wears `public` — the one-action
// application: the lock screen.
export const rolesOf = (principalId: string | null): readonly string[] =>
  principalId === null ? ['public'] : (ASSIGNMENTS[principalId] ?? ['public']);
