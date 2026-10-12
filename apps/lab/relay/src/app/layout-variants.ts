import type { LayoutVariant } from '@niscorp/moss';
import { topbarFullLayout } from '@relay/app/actions/chrome/topbar.full.layout';

// A variant adds to the action's base layout, which is the shape for the
// least-privileged holder. A variant that removes would need a deny in every
// richer role, and a forgotten deny over-serves silently.
export const LAYOUT_VARIANTS: Record<string, LayoutVariant> = {
  'chrome.topbar.full': { action: 'chrome.topbar', layout: topbarFullLayout },
};
