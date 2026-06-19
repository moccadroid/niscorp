import { createContext, type FC, type ReactNode } from 'react';
import type { ActionDefinition } from '@action';
import type { ComponentRegistry } from '@layout';
import type { Shell } from '@shell';
import type { NovaComponent, NovaDispatch, NovaPublish } from './types';

// ═══════════════════════════════════════════════════════════
// Two React contexts:
//   - NovaRenderContext: registry + dispatch + publish (+ optional
//     slotWrapper). Required to render a layout. Does NOT require a shell.
//   - NovaShellContext: the shell itself. Consumers who want
//     shell-aware hooks (canvases, runtimes, state) need this.
// ═══════════════════════════════════════════════════════════

// An app-supplied component that wraps each action instance's rendered content
// at the ActionSlot seam — the single pluggable point for cross-cutting
// concerns: enter/leave animation, an auth/feature gate, logging, an error
// boundary. Nova hands it IDENTITY (canvasId / instanceId / the action's
// definition), never live state, and owns no timing — the wrapper (and whatever
// it plugs in: framer-motion, react-transition-group, plain CSS) owns all of
// that. The three identity fields are `undefined` while a slot is empty or
// exiting; a presence-managing wrapper captured them when content was present.
export type SlotWrapperProps = {
  canvasId?: string;
  instanceId?: string;
  action?: ActionDefinition;
  children?: ReactNode;
};
export type SlotWrapper = FC<SlotWrapperProps>;

export type NovaRenderContextValue = {
  registry: ComponentRegistry<NovaComponent>;
  dispatch: NovaDispatch;
  publish: NovaPublish;
  slotWrapper?: SlotWrapper;
};

export const NovaRenderContext = createContext<NovaRenderContextValue | undefined>(undefined);
export const NovaShellContext = createContext<Shell | undefined>(undefined);
