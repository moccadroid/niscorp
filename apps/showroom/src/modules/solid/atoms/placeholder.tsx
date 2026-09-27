import type { FC } from 'react';
import { INK } from '@showroom/chrome/stage/ui';

// Grey skeleton span for partially-arrived string fields.

export const Placeholder: FC<{ width?: number }> = ({ width = 120 }) => (
  <span style={{ display: 'inline-block', width, maxWidth: '100%', height: 13, borderRadius: 5, background: INK.line, verticalAlign: 'middle' }} />
);
