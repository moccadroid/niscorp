import type { FC, ReactNode } from 'react';

// The LibraryModule contract requires a RuntimeProvider. Nova demos
// own their own shell/registry at module level, so no runtime state
// needs threading through context — just pass children through.
export const NovaRuntimeProvider: FC<{ children: ReactNode }> = ({ children }) => <>{children}</>;
