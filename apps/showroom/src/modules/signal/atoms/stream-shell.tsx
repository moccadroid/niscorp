import type { FC, ReactNode } from 'react';

// Max-width centered container for the interactive area of a
// signal stream demo. Sits below the Pitch callout.
export const StreamShell: FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 24px' }}>{children}</div>
);
