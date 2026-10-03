import { renderToString } from '@niscorp/nova/adapters/dom/server';
import { shellView } from '@niscorp/nova';
import { mountShell } from '@niscorp/nova/adapters/dom';
import type { Shell } from '@niscorp/nova';
import { fallback } from '@niscorp/nova/adapters/dom/components';
import { buildRegistry } from './registry';

// The screen, with nova's DOM adapter — no framework in the page. Drawn to
// markup at build (`draw`, handed a DOM to build in), and mounted in the page
// over what was drawn (`adopt`): the adapter rebuilds its root with the same
// elements, and from then on it is the shell's.
export const draw = (shell: Shell, window: object): string => renderToString(buildRegistry(), shellView(shell).api, { window, fallback });

export const adopt = (root: HTMLElement, shell: Shell): void => {
  mountShell(root, buildRegistry(), shell, { fallback });
};
