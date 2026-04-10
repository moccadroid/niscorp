import { createContext, useContext, useState, type FC, type ReactNode } from 'react';
import type { SignalResult } from '@niscorp/signal';

// ═══════════════════════════════════════════════════════════
// Signal runtime context — published by the recipe runner so
// the inspector tabs can read the live result without prop
// drilling. Mirrors the nova/prism pattern.
// ═══════════════════════════════════════════════════════════

export type SignalView = {
  mode: 'snapshot' | 'live';
  loading: boolean;
  result: SignalResult<unknown> | undefined;
  error: string | undefined;
};

type ContextShape = {
  view: SignalView | undefined;
  setView: (view: SignalView | undefined) => void;
};

const noopSet = (_view: SignalView | undefined): void => {};

const SignalContext = createContext<ContextShape>({ view: undefined, setView: noopSet });

export const useSignalView = (): SignalView | undefined => useContext(SignalContext).view;

export const useSignalSetter = (): ((view: SignalView | undefined) => void) =>
  useContext(SignalContext).setView;

export const SignalRuntimeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [view, setView] = useState<SignalView | undefined>(undefined);
  return <SignalContext.Provider value={{ view, setView }}>{children}</SignalContext.Provider>;
};
