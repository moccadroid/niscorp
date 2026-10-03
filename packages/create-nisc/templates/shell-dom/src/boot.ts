import { createShell } from '@niscorp/nova';
import type { Shell } from '@niscorp/nova';
import { actions } from './app/action-catalog';
import { shell } from './app/shell/shell';
import { buildRegistry } from './ui/registry';

// The shell factory (AGENTS.md, "The client-degrade path"): the app's
// artifacts, plus everything environmental injected here — a fetch for
// endpoints, the app's "today", a Prism transform — once it has any.
//
// A FRESH shell on every call: the page boots one, and a build boots more than
// one (it draws the first screen from one and checks it against others), so
// nothing may be shared between calls. Instance ids are counted, not random, so
// two boots draw the same markup.
export const boot = (): Shell => {
  let minted = 0;
  return createShell({ ...shell, actions, registry: buildRegistry(), instanceIdFn: () => `i${(minted += 1)}` });
};
