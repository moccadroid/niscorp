import type { FC, ReactNode } from 'react';

export const StreamShell: FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 24px' }}>{children}</div>
);
