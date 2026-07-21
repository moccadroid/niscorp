import { createContext, type ComponentType, type FC, type ReactNode } from 'react';
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
  // used when a component name is unregistered — a permissive renderer (a
  // terminal on a reference kit) supplies one so unknown primitives render
  // their children instead of an error marker; strict consumers omit it.
  // Same seam as the DOM and TTY adapters' `fallback`.
  fallback?: NovaComponent;
  // host-specific leaf renderers. The DOM host renders a text node as a bare
  // string and an error node as a <span> — both crash a non-DOM react host
  // (ink requires every string inside <Text>). A host that isn't the DOM
  // supplies its own wrappers; browser consumers omit both.
  textWrapper?: ComponentType<{ children?: ReactNode }>;
  errorMarker?: ComponentType<{ code: string; message: string }>;
};

export const NovaRenderContext = createContext<NovaRenderContextValue | undefined>(undefined);
export const NovaShellContext = createContext<Shell | undefined>(undefined);
