import type { FC, ReactNode } from 'react';

// Max-width wrapper for the demo content area.

export const DemoShell: FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 24px' }}>{children}</div>
);
