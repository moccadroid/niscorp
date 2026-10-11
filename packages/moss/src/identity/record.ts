// What an application says a principal IS. Opaque: `roles` goes to charter,
// `installed` is filtered against, `scope` is merged into vex's scope values
// without moss ever looking inside it.
export type IdentityRecord = {
  // The rungs this principal wears. Charter compiles a policy from them.
  roles: readonly string[];
  // Everything else a principal is — a tenant, a region, a locale. Merged into
  // the engine's scope values server-side and unforgeable by a request.
  scope: Record<string, unknown>;
  // Integration ids live for this principal's tenant. `undefined` means every
  // registered integration is live, which is right for a single-tenant app and
  // wrong the moment there are two.
  installed?: readonly string[];
  // WHAT THIS PRINCIPAL SHARES A FATE WITH — an opaque string the application
  // chooses, and the only reason moss keeps a second map.
  //
  // This is NOT a secondary index, and the difference is the whole
  // justification: a by-email index is a way to FIND somebody, and a way to
  // find somebody is a query planner. This supports exactly one operation —
  // FORGET everyone wearing this tag — and no operation that returns a record.
  // You cannot read anything through it.
  //
  // It exists because "a tenant-local write invalidates that tenant, not the
  // deployment" is otherwise unachievable: dropping one tenant's records means
  // naming them, and naming them without enumerating the population needs the
  // application to have said, at resolve time, which ones go together. Moss
  // never interprets the string — it is a tenant id here, and it could be an
  // org, a region, or nothing at all.
  tag?: string;
};
