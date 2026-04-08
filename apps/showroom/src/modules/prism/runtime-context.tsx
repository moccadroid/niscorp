import type { FC, ReactNode } from 'react';

// ═══════════════════════════════════════════════════════════
// Prism's "runtime" is purely synchronous — there is no live
// state to publish. The provider is a no-op passthrough so the
// LibraryModule contract (which requires a RuntimeProvider) is
// satisfied without any unnecessary React context.
// ═══════════════════════════════════════════════════════════

export const PrismRuntimeProvider: FC<{ children: ReactNode }> = ({ children }) => <>{children}</>;
