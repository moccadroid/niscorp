import { useState, useMemo, type FC, type ReactNode } from 'react';

export type InspectorTabDef = {
  id: string;
  label: string;
  render: () => ReactNode;
};

type Props = {
  tabs: InspectorTabDef[];
};

export const ChromeInspector: FC<Props> = ({ tabs }) => {
  const firstId = tabs[0]?.id ?? '';
  const [active, setActive] = useState<string>(firstId);
  const currentActive = useMemo(() => {
    return tabs.find((t) => t.id === active) ?? tabs[0];
  }, [tabs, active]);

  return (
    <aside
      style={{
        width: 360,
        background: '#fafafa',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #e5e7eb',
          background: '#f3f4f6',
        }}
      >
        {tabs.map((t) => {
          const isActive = currentActive?.id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              style={{
                flex: 1,
                padding: '8px 4px',
                fontSize: 11,
                border: 'none',
                background: isActive ? '#ffffff' : 'transparent',
                borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                cursor: 'pointer',
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>{currentActive?.render()}</div>
    </aside>
  );
};
