import type { Bundle } from './bundle';

// ── WHAT A BUNDLE MAY BE CALLED AT ───────────────────────────
//
// Intake holds what a bundle DECLARES. What the proxy FORWARDS is held to the
// same declaration: a proxy that forwarded any path under an integration's
// prefix would expose the whole of its service to anybody signed in where it
// is installed. For a rank tracker that is rank data. For a payments service
// it is a payments service.
//
// So the declaration is the perimeter: the union of every endpoint a bundle's
// actions name under its own prefix. Anything else is not a route this
// integration has, and the proxy answers as if it were not there.
//
// DERIVED, NEVER AUTHORED. An integration cannot widen its own reach without shipping
// the screen that uses it, and re-importing is the only thing that moves it —
// the same call an operator already makes.
const normalizeReach = (path: string): string => (path.split('?')[0] ?? '').replace(/\/+$/, '');

// ENDPOINT → THE ACTIONS THAT DECLARE IT, and the second half is the point of
// this shape.
//
// "Is this path declared?" is not the question the proxy asks. The charter
// draws its fences per ACTION (`ext.desk.*` for a desk, `ext.member.*` for a
// member), so a perimeter that cannot name the action cannot hold them: a
// flat list of paths would let a member of a studio call the endpoint its
// desk's screen declares.
//
// Several actions may name one endpoint, which is why the value is a list. Any
// action the caller holds admits the call: the union, as the charter itself
// resolves.
export type Reach = Record<string, string[]>;

export const reachOf = (bundle: Bundle, integrationId: string): Reach => {
  const own = `/integrations/${integrationId}/`;
  const reach: Reach = {};
  const admit = (url: string, actionId: string): void => {
    // A `/api/*/vex` endpoint is a call to the HOST, checked against the
    // fingerprints above. Only the integration's own prefix is reach.
    if (!url.startsWith(own)) return;
    const key = normalizeReach(url);
    const held = (reach[key] ??= []);
    if (!held.includes(actionId)) held.push(actionId);
  };
  for (const [actionId, action] of Object.entries(bundle.actions)) {
    for (const endpoint of Object.values(action.endpoints ?? {})) {
      admit('url' in endpoint ? endpoint.url : '', actionId);
    }
  }
  return Object.fromEntries(Object.entries(reach).sort(([a], [b]) => a.localeCompare(b)));
};

// FAIL CLOSED TWICE: a path this integration never declared, and a path no
// action the CALLER HOLDS declares. A row with no reach forwards nothing: an
// empty object admits nothing either, and importing again writes one.
export const reachAdmits = (reach: Reach, path: string, held: ReadonlySet<string>): boolean =>
  (reach[normalizeReach(path)] ?? []).some((actionId) => held.has(actionId));

// WITHOUT A CALLER. The operator's probe asks whether this integration declared
// a path at all, which is a question about the bundle rather than about
// anybody's grants — an operator holds no catalog and needs none, and filtering
// their diagnostic by a member's screens would make "the screen is empty"
// harder to answer rather than safer.
export const reachDeclares = (reach: Reach, path: string): boolean => reach[normalizeReach(path)] !== undefined;
