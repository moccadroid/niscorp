import { createContext, useContext, useMemo, useState, type FC, type ReactNode } from 'react';

// ═══════════════════════════════════════════════════════════
// Cortex runtime context
// ═══════════════════════════════════════════════════════════
//
// Holds the last run's result so the inspector tabs can read it
// without each tab re-running the agent. The runner publishes here
// when a run finishes; tabs subscribe via useCortexRuntime.
//
// The LastRun type is generic — it works for any story kind, not
// just Prism mapping. Each runner publishes what it has.

export type LastRun = {
  storyId: string;
  kind: string;
  durationMs: number;
  result?: unknown;
  error?: { code: string; message: string };
  observations?: ReadonlyArray<unknown>;
  // Prism-mapping-specific fields (populated by PrismMappingRunner only)
  prism?: {
    config: unknown;
    reasoning?: string;
    evaluated: unknown;
    matchesExpected: boolean;
  };
};

type CortexRuntimeApi = {
  lastRun: LastRun | undefined;
  setLastRun: (run: LastRun | undefined) => void;
};

const CortexRuntimeContext = createContext<CortexRuntimeApi | undefined>(undefined);

export const CortexRuntimeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [lastRun, setLastRun] = useState<LastRun | undefined>(undefined);
  const value = useMemo<CortexRuntimeApi>(() => ({ lastRun, setLastRun }), [lastRun]);
  return <CortexRuntimeContext.Provider value={value}>{children}</CortexRuntimeContext.Provider>;
};

export const useCortexRuntime = (): CortexRuntimeApi => {
  const ctx = useContext(CortexRuntimeContext);
  if (ctx === undefined) {
    throw new Error('useCortexRuntime must be used inside CortexRuntimeProvider');
  }
  return ctx;
};
