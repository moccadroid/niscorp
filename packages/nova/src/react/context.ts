import { createContext } from 'react';
import type { ComponentRegistry } from '@layout';
import type { Shell } from '@shell';
import type { NovaComponent, NovaDispatch, NovaPublish } from './types';

// ═══════════════════════════════════════════════════════════
// Two React contexts:
//   - NovaRenderContext: registry + dispatch + publish. Required
//     to render a layout. Does NOT require a shell.
//   - NovaShellContext: the shell itself. Consumers who want
//     shell-aware hooks (canvases, runtimes, state) need this.
// ═══════════════════════════════════════════════════════════

export type NovaRenderContextValue = {
  registry: ComponentRegistry<NovaComponent>;
  dispatch: NovaDispatch;
  publish: NovaPublish;
};

export const NovaRenderContext = createContext<NovaRenderContextValue | undefined>(undefined);
export const NovaShellContext = createContext<Shell | undefined>(undefined);
