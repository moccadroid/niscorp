import { createContext, useContext, useMemo, useState, type FC, type ReactNode } from 'react';

// ═══════════════════════════════════════════════════════════
// Cortex runtime context
// ═══════════════════════════════════════════════════════════
//
// Holds the last run's result so the inspector tabs (e.g. a future
// "Observations" or "Context Pack" tab) can read it without each
// tab re-running the agent. The runner publishes here when a run
// finishes; tabs subscribe via useCortexRuntime.

import type { Config } from '@niscorp/prism';
import type { JsonValue } from '@niscorp/prism';

export type LastRun = {
  storyId: string;
  config: Config;
  reasoning?: string;
  evaluated: JsonValue;
  matchesExpected: boolean;
  durationMs: number;
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
