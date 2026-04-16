import type { FC, ReactNode } from 'react';

type Props = {
  name: string;
  description: string;
  children: ReactNode;
  // On mobile the canvas is full-width with no adjacent panes, so
  // the vertical borders that separate it from sidebar/inspector on
  // desktop become stray lines against the viewport edge.
  isMobile?: boolean;
};

export const CanvasPane: FC<Props> = ({ name, description, children, isMobile }) => {
  return (
    <main
      style={{
        flex: 1,
        minWidth: 0,
        background: '#ffffff',
        overflow: 'auto',
        borderLeft: isMobile === true ? 'none' : '1px solid #e5e7eb',
        borderRight: isMobile === true ? 'none' : '1px solid #e5e7eb',
      }}
    >
      <header
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid #e5e7eb',
          background: '#fafafa',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>{description}</div>
      </header>
      {children}
    </main>
  );
};
