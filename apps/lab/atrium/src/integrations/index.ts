import type { IntegrationBundle } from './types';
import { MEWS_BUNDLE } from './mews/bundle';
import { OPERA_BUNDLE } from './opera/bundle';

// Every bundle THIS SERVICE serves. Nothing in the app imports it: the
// service composes each into a `/bundle` payload, and the app pulls, gates
// and stores that — actions, queries, slots and menus all arrive as rows it
// had no compile-time knowledge of. This list is the service's own inventory,
// on the service's side of the wire.
//
// HotelFix has no bundle: it reports one capability (issue.report) and ships
// the fault categories for it. A capability whose surfaces live in the app's
// core catalog is a legitimate integration — intake asks a bundle to be
// coherent, not to be large.
export const BUNDLES: IntegrationBundle[] = [MEWS_BUNDLE, OPERA_BUNDLE];

export type { IntegrationBundle } from './types';
export { audienceOfAction } from './types';
