import type { Bundle } from './bundle';

// ── WHAT A BUNDLE MAY BE CALLED AT ───────────────────────────
//
// The intake checks below constrain what a bundle DECLARES. They never
// constrained what the proxy FORWARDS — which forwarded any path under an integration's
// prefix, for any signed-in principal at an installed studio. For a rank tracker
// that exposes rank data. For a payments service it exposes a payments service.
//
// So the declaration becomes the perimeter: the union of every endpoint a
// bundle's actions name under its own prefix, plus every preview an attachment
// rides on. Anything else is not a route this integration has, and the proxy
// answers as if it were not there.
//
// DERIVED, NEVER AUTHORED. An integration cannot widen its own reach without shipping
// the screen or the strip that uses it, and re-importing is the only thing that
// moves it — the same call an operator already makes.
const normalizeReach = (path: string): string => (path.split('?')[0] ?? '').replace(/\/+$/, '');

// ENDPOINT → THE ACTIONS THAT DECLARE IT, and the second half is the whole
// point of this shape.
//
// This used to be a flat list of paths, and the loop below threw the action id
// away — which made "is this path declared?" the only question the proxy could
// ask. It is the wrong question. The charter draws its fences per ACTION
// (`ext.desk.*` for a desk, `ext.member.*` for a member), so a perimeter that
// cannot name the action cannot enforce them, and being signed in at a studio
// that installed a payments integration was permission to call its merchant
// onboarding endpoint.
//
// Several actions may name one endpoint, which is why the value is a list. Any
// held action admits the call — the union, exactly as the charter itself
// resolves — and the integration's own declaration is what states it, printed
// on the approval card before anybody turns it on.
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
  // A preview belongs to the action that rides the strip, so it inherits that
  // action's audience rather than being reachable by everybody who can see the
  // host screen it hangs off.
  for (const [actionId, binding] of Object.entries(bundle.attachments)) {
    if (typeof binding !== 'string') admit(binding.preview, actionId);
  }
  return Object.fromEntries(Object.entries(reach).sort(([a], [b]) => a.localeCompare(b)));
};

// FAIL CLOSED TWICE: a path this integration never declared, and a path no
// action the CALLER HOLDS declares. A row with no reach — one written before
// this column existed — still forwards nothing, because an empty object admits
// nothing either. A silent widening is the failure mode worth paying a
// re-import to avoid, and re-importing is one operator call.
export const reachAdmits = (reach: Reach, path: string, held: ReadonlySet<string>): boolean =>
  (reach[normalizeReach(path)] ?? []).some((actionId) => held.has(actionId));

// WITHOUT A CALLER. The operator's probe asks whether this integration declared
// a path at all, which is a question about the bundle rather than about
// anybody's grants — an operator holds no catalog and needs none, and filtering
// their diagnostic by a member's screens would make "the screen is empty"
// harder to answer rather than safer.
export const reachDeclares = (reach: Reach, path: string): boolean => reach[normalizeReach(path)] !== undefined;

// The same question at the other door. A frame names one owner rather than a
// list: a page is served by the screen that opens it, and two screens wanting
// one page is a bundle that should say so twice.
export const frameAdmits = (frames: Readonly<Record<string, string>>, path: string, held: ReadonlySet<string>): boolean => {
  const owner = frames[path];
  return owner !== undefined && held.has(owner);
};

// The host surface a screen calls to be handed a framed page's URL. Named once
// here because intake admits it and the frame route serves it, and two spellings
// of the same path is how a seam stops working for one caller.
export const FRAME_GRANT_URL = '/api/integrations/frame';
