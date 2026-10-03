// Who wears which roles: principal id → role names. Empty until somebody can
// sign in; the anonymous principal is always `public`.
export const assignments: Record<string, readonly string[]> = {};
