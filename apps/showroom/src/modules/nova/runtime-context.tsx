import { createContext, useContext, useState, type FC, type ReactNode } from 'react';
import type {
  CanvasState,
  ComponentRegistry,
  PublicActionRuntime,
  RenderNode,
} from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/react';
import type { ExpectationResult } from '../../lib/check-expectation';

export type RuntimeView = {
  data: Record<string, unknown>;
  renderTree: RenderNode[];
  runtime: PublicActionRuntime | undefined;
  expectationResult: ExpectationResult | undefined;
  registry: ComponentRegistry<NovaComponent> | undefined;
  canvasStates?: Record<string, CanvasState>;
};

type ContextShape = {
  view: RuntimeView | undefined;
  setView: (view: RuntimeView | undefined) => void;
};

const noopSet = (_view: RuntimeView | undefined): void => {};

const RuntimeContext = createContext<ContextShape>({ view: undefined, setView: noopSet });

export const useRuntimeView = (): RuntimeView | undefined => useContext(RuntimeContext).view;

export const useRuntimeSetter = (): ((view: RuntimeView | undefined) => void) =>
  useContext(RuntimeContext).setView;

export const NovaRuntimeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [view, setView] = useState<RuntimeView | undefined>(undefined);
  return <RuntimeContext.Provider value={{ view, setView }}>{children}</RuntimeContext.Provider>;
};
