import type { FC } from 'react';

// Small pill showing '…' while a subtree is still streaming and
// 'FINAL' once its `onFinal` has fired.

export const FinalBadge: FC<{ done: boolean }> = ({ done }) => (
  <span
    style={{
      fontSize: 10,
      fontWeight: 600,
      padding: '2px 6px',
      borderRadius: 3,
      background: done ? '#dcfce7' : '#f1f5f9',
      color: done ? '#166534' : '#cbd5e1',
      transition: 'all 300ms',
    }}
  >
    {done ? 'FINAL' : '…'}
  </span>
);
