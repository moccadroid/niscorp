import type { LayoutVariant } from '@niscorp/moss';
import { topbarFullLayout } from '@relay/app/actions/chrome/topbar.full.layout';

// Ring 2, minted: variant id → the action it reshapes and the layout served
// in place of the base. The charter's `layouts` section selects who holds
// which; this map is the universe it selects over. The reference direction
// is variant → action — minting a variant never touches the action.
//
// Direction doctrine: the base layout is the FLOOR (the least-privileged
// holder's shape); variants ENRICH upward and are granted like any other
// capability, so `extends` composes them correctly. A variant that reduces
// is authored backwards — it forces deny-it-back in every richer role and
// a forgotten deny over-serves silently. A forgotten grant under-serves
// visibly: fail-closed.
export const LAYOUT_VARIANTS: Record<string, LayoutVariant> = {
  'chrome.topbar.full': { action: 'chrome.topbar', layout: topbarFullLayout },
};
