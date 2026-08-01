// Who wears which roles. Principal ids ARE the row ids they correspond to
// (`gst_amara` is a guests row, `stf_rosa` a staff row) — a demo shortcut that
// keeps the directory honest: there is exactly one place a principal is turned
// into a property, a stay and an audience, and it is `server/users.ts`.
//
// Nobody here wears two audiences. That is deliberate: the whole claim is that
// the same URL is a different application per token, and a principal holding
// both `guest` and `desk` would blur the one thing the demo exists to show.
//
// Henrik manages BOTH houses — as two principals, one per property, because a
// principal is single-tenant by construction. The chrome's switcher moves the
// HUMAN between them (a re-grant, exactly like login); the tenant boundary
// never bends to accommodate the org chart.
export const ASSIGNMENTS: Record<string, readonly string[]> = {
  gst_amara: ['guest'],
  gst_theo: ['guest'],
  gst_ines: ['guest'],
  stf_rosa: ['desk'],
  stf_pilar: ['desk'],
  stf_kwame: ['service'],
  stf_henrik: ['ops'],
  stf_henrik_m: ['ops'],
  usr_vendor: ['vendor'],
};
