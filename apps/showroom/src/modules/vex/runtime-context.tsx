import { createContext, useContext, useEffect, useState, type FC, type ReactNode } from 'react';
import { getVexRuntime, type VexRuntime } from './runtime/boot';
import type { LlmExchange } from './runtime/live-debug';

// ═══════════════════════════════════════════════════════════
// Vex runtime context — boots the PGlite-backed engine once and
// shares it with every story, plus a "current run" view the
// inspector tabs read (DSL / SQL / cache meta) without prop drilling.
// Mirrors the signal/cortex runtime-context pattern.
// ═══════════════════════════════════════════════════════════

export type BootState =
  | { status: 'booting' }
  | { status: 'ready'; runtime: VexRuntime }
  | { status: 'error'; error: string };

// What the last run produced — surfaced to the inspector tabs.
export type RunView = {
  scenarioId: string;
  intent: string;
  shape: unknown;
  context: Record<string, unknown>;
  dsl: unknown;
  sql?: string;
  rows?: unknown[];
  warnings?: string[];
  cacheHit?: boolean;
  cacheKey?: string;
  scopeClause?: string;
  timing?: { agentMs?: number; executionMs?: number; mappingMs?: number; totalMs?: number };
  error?: string;
  transcript?: LlmExchange[];
};

type ContextShape = {
  boot: BootState;
  view: RunView | undefined;
  setView: (view: RunView | undefined) => void;
};

const VexContext = createContext<ContextShape>({
  boot: { status: 'booting' },
  view: undefined,
  setView: () => {},
});

export const useVexBoot = (): BootState => useContext(VexContext).boot;
export const useVexRunView = (): RunView | undefined => useContext(VexContext).view;
export const useVexRunSetter = (): ((view: RunView | undefined) => void) =>
  useContext(VexContext).setView;

export const VexRuntimeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [boot, setBoot] = useState<BootState>({ status: 'booting' });
  const [view, setView] = useState<RunView | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getVexRuntime()
      .then((runtime) => {
        if (!cancelled) setBoot({ status: 'ready', runtime });
      })
      .catch((err: unknown) => {
        if (!cancelled) setBoot({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <VexContext.Provider value={{ boot, view, setView }}>{children}</VexContext.Provider>;
};
