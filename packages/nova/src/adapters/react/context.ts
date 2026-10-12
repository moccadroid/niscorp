import { createContext, type ComponentType, type FC, type ReactNode } from 'react';
import type { ActionDefinition } from '@action';
import type { ComponentRegistry } from '@layout';
import type { Shell } from '@shell';
import type { NovaComponent, NovaDispatch, NovaPublish } from './types';

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
  fallback?: NovaComponent;
  textWrapper?: ComponentType<{ children?: ReactNode }>;
  errorMarker?: ComponentType<{ code: string; message: string }>;
};

export const NovaRenderContext = createContext<NovaRenderContextValue | undefined>(undefined);
export const NovaShellContext = createContext<Shell | undefined>(undefined);
