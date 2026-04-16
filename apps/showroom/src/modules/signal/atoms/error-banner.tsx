import type { FC } from 'react';

// Inline red banner for runtime errors from the signal call
// (network failure, provider rejection, abort). Renders null
// when message is empty so callers don't need a conditional.
export const ErrorBanner: FC<{ message: string }> = ({ message }) =>
  message === '' ? null : (
    <div
      style={{
        padding: '12px 16px',
        marginBottom: 16,
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderLeft: '4px solid #dc2626',
        borderRadius: 6,
        fontSize: 13,
        color: '#991b1b',
      }}
    >
      {message}
    </div>
  );
