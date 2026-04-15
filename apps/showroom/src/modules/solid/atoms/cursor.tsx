import type { FC } from 'react';

// Blinking text cursor shown at the tail of a streaming string.

export const Cursor: FC = () => (
  <span
    style={{
      display: 'inline-block',
      width: 2,
      height: 14,
      background: '#2563eb',
      marginLeft: 1,
      verticalAlign: 'middle',
      animation: 'solid-cursor-blink 1s step-end infinite',
    }}
  >
    <style>{`@keyframes solid-cursor-blink { 50% { opacity: 0; } }`}</style>
  </span>
);
