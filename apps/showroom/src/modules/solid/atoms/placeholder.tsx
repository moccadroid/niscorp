import type { FC } from 'react';

// Grey skeleton span for partially-arrived string fields.

export const Placeholder: FC<{ width?: number }> = ({ width = 120 }) => (
  <span
    style={{
      display: 'inline-block',
      width,
      height: 14,
      borderRadius: 4,
      background: '#e2e8f0',
      verticalAlign: 'middle',
    }}
  />
);
