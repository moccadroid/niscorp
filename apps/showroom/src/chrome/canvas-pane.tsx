import type { FC, ReactNode } from 'react';

type Props = {
  name: string;
  description: string;
  children: ReactNode;
};

export const CanvasPane: FC<Props> = ({ name, description, children }) => {
  return (
    <main
      style={{
        flex: 1,
        background: '#ffffff',
        overflow: 'auto',
        borderLeft: '1px solid #e5e7eb',
        borderRight: '1px solid #e5e7eb',
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
