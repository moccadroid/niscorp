import type { Component, InjectionKey } from 'vue';
import type { ActionDefinition } from '@action';
import type { ComponentRegistry } from '@layout';
import type { Shell } from '@shell';
import type { NovaComponent, NovaDispatch, NovaPublish } from './types';

// ═══════════════════════════════════════════════════════════
// Two injections, the twins of the React adapter's two contexts:
//   - NovaRenderKey: registry + dispatch + publish (+ optional slotWrapper /
//     fallback). Required to render a layout. Does NOT require a shell.
//   - NovaShellKey: the shell. Shell-aware composables need it.
//
// Keys are `Symbol.for`, not `Symbol()`: a CJS consumer loading the adapter
// and its components subpath as two bundles gets two module copies, and a
// private symbol per copy would make one's provide invisible to the other's
// inject. A registered symbol is one identity however many copies load.
//
// Both values are GETTER objects over the provider's props, so a component
// that injected once reads the provider's current registry / dispatch /
// shell — a prop swap reaches every descendant without re-providing.
// ═══════════════════════════════════════════════════════════

// An app-supplied component that wraps each action instance's rendered content
// at the ActionSlot seam (animation, gating, logging). It receives identity
// only — these props — and the content as its default slot; all three are
// undefined while the slot is empty or exiting. Nova owns no timing.
export type SlotWrapperProps = {
  canvasId?: string;
  instanceId?: string;
  action?: ActionDefinition;
};
export type SlotWrapper = Component;

export type NovaRenderContextValue = {
  // unknown-typed: a shell's registry is untyped, and the walker narrows each
  // entry (isNovaComponent) rather than trusting a cast
  readonly registry: ComponentRegistry;
  readonly dispatch: NovaDispatch;
  readonly publish: NovaPublish;
  readonly slotWrapper?: SlotWrapper;
  // rendered for an unregistered component name — a permissive host supplies
  // one; strict consumers omit it and get a COMPONENT_NOT_FOUND marker
  readonly fallback?: NovaComponent;
};

export type NovaShellSource = { readonly shell: Shell };

export const NovaRenderKey: InjectionKey<NovaRenderContextValue> = Symbol.for('@niscorp/nova/adapters/vue:render');
export const NovaShellKey: InjectionKey<NovaShellSource> = Symbol.for('@niscorp/nova/adapters/vue:shell');
