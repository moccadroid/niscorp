import { renderToString } from '@niscorp/nova/adapters/dom/server';
import { shellView } from '@niscorp/nova';
import { mountShell } from '@niscorp/nova/adapters/dom';
import type { Shell } from '@niscorp/nova';
import { fallback } from '@niscorp/nova/adapters/dom/components';
import { buildRegistry } from './registry';

export const draw = (shell: Shell, window: object): string => renderToString(buildRegistry(), shellView(shell).api, { window, fallback });

export const adopt = (root: HTMLElement, shell: Shell): void => {
  mountShell(root, buildRegistry(), shell, { fallback });
};
