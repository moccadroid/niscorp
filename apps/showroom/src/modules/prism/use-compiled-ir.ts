import { useEffect, useState } from 'react';
import { compile, ConfigSchema, type CompiledIr } from '@niscorp/prism';

// ═══════════════════════════════════════════════════════════
// Compiles a prism config in an effect (compile() is async).
// Returns a discriminated state: loading | ok | error.
// Used by both the Stats and Compiled inspector tabs.
// ═══════════════════════════════════════════════════════════

export type CompileState =
  | { status: 'loading' }
  | { status: 'ok'; ir: CompiledIr }
  | { status: 'error'; error: string };

const LOADING: CompileState = { status: 'loading' };

export const useCompiledIr = (config: unknown): CompileState => {
  const [state, setState] = useState<CompileState>(LOADING);

  useEffect(() => {
    let cancelled = false;
    setState(LOADING);
    const parsed = ConfigSchema.safeParse(config);
    if (!parsed.success) {
      setState({ status: 'error', error: parsed.error.message });
      return;
    }
    void compile(parsed.data)
      .then((ir) => {
        if (!cancelled) setState({ status: 'ok', ir });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return (): void => {
      cancelled = true;
    };
  }, [config]);

  return state;
};
