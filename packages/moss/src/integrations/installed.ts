// ── which integration an action belongs to ───────────────────
//
// `ext.<audience>.<integration>.<name>` → the integration. Derived, never
// stored twice.
export const integrationOfAction = (id: string): string | undefined =>
  id.startsWith('ext.') ? id.split('.')[2] : undefined;

// INSTALLATION IS PER TENANT, and this is where that lands.
//
// The charter grants `ext.desk.*` once, to every desk in the deployment — so
// without this, one studio installing an integration puts it on every studio's front
// desk. Moss cannot filter that itself: it does not know what a studio is, on
// purpose. The app answers, and the answer is a list of ids.
export const filterInstalled = (ids: readonly string[], installed: ReadonlySet<string> | undefined): readonly string[] => {
  if (installed === undefined) return ids;
  return ids.filter((id) => {
    const owner = integrationOfAction(id);
    return owner === undefined || installed.has(owner);
  });
};
