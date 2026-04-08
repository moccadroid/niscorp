import type { FC } from 'react';

export type DotColor = 'gray' | 'green' | 'red';

const DOT_COLOR: Record<DotColor, string> = {
  gray: '#9ca3af',
  green: '#16a34a',
  red: '#dc2626',
};

type Props = { color: DotColor };

export const StatusDot: FC<Props> = ({ color }) => (
  <span
    style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: 999,
      background: DOT_COLOR[color],
      marginRight: 8,
      flexShrink: 0,
    }}
  />
);
