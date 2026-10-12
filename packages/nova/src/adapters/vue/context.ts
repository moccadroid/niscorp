import type { Component, InjectionKey } from 'vue';
import type { ActionDefinition } from '@action';
import type { ComponentRegistry } from '@layout';
import type { Shell } from '@shell';
import type { NovaComponent, NovaDispatch, NovaPublish } from './types';

// The keys are `Symbol.for`, not `Symbol()`: a private symbol in each copy of
// this module would hide one copy's provide from the other's inject.

export type SlotWrapperProps = {
  canvasId?: string;
  instanceId?: string;
  action?: ActionDefinition;
};
export type SlotWrapper = Component;

export type NovaRenderContextValue = {
  readonly registry: ComponentRegistry;
  readonly dispatch: NovaDispatch;
  readonly publish: NovaPublish;
  readonly slotWrapper?: SlotWrapper;
  readonly fallback?: NovaComponent;
};

export type NovaShellSource = { readonly shell: Shell };

export const NovaRenderKey: InjectionKey<NovaRenderContextValue> = Symbol.for('@niscorp/nova/adapters/vue:render');
export const NovaShellKey: InjectionKey<NovaShellSource> = Symbol.for('@niscorp/nova/adapters/vue:shell');
