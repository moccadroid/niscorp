import type { FC, ReactNode } from 'react';
import { INK } from '@showroom/chrome/stage/ui';

// The demo's working area: the stage's width and ink, content in a column.

export const DemoShell: FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 24px 48px', display: 'flex', flexDirection: 'column', gap: 14, color: INK.text }}>{children}</div>
);
