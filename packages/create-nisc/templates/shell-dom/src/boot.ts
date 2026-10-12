import { createShell } from '@niscorp/nova';
import type { Shell } from '@niscorp/nova';
import { actions } from './app/action-catalog';
import { shell } from './app/shell/shell';
import { buildRegistry } from './ui/registry';

// A fresh shell on every call: a build boots more than one and checks what
// they draw against each other, so nothing may be shared between calls.
// Instance ids are counted, not random, so two boots draw the same markup.
export const boot = (): Shell => {
  let minted = 0;
  return createShell({ ...shell, actions, registry: buildRegistry(), instanceIdFn: () => `i${(minted += 1)}` });
};
