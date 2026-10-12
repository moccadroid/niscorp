import type { FC } from 'react';
import { INK } from '@showroom/chrome/stage/ui';

export const Placeholder: FC<{ width?: number }> = ({ width = 120 }) => (
  <span style={{ display: 'inline-block', width, maxWidth: '100%', height: 13, borderRadius: 5, background: INK.line, verticalAlign: 'middle' }} />
);
