import { useState, useMemo, type CSSProperties, type FC } from 'react';
import type { InspectorTabDef } from '@showroom/modules/types';

type Props = {
  tabs: InspectorTabDef[];
  // When true, render as a fixed overlay drawer from the right.
  isMobile?: boolean;
  onClose?: () => void;
};

const DESKTOP_STYLE: CSSProperties = {
  width: 'max(420px, calc((100vw - 240px) * 0.4))',
  flexShrink: 0,
  background: '#fafafa',
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
};

const MOBILE_STYLE: CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: 'min(440px, 92vw)',
  background: '#fafafa',
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 50,
  boxShadow: '-4px 0 12px rgba(0,0,0,0.15)',
};

export const ChromeInspector: FC<Props> = ({ tabs, isMobile, onClose }) => {
  const firstId = tabs[0]?.id ?? '';
  const [active, setActive] = useState<string>(firstId);
  const currentActive = useMemo(() => {
    return tabs.find((t) => t.id === active) ?? tabs[0];
  }, [tabs, active]);

  return (
    <aside style={isMobile === true ? MOBILE_STYLE : DESKTOP_STYLE}>
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          borderBottom: '1px solid #e5e7eb',
          background: '#f3f4f6',
        }}
      >
        <div style={{ display: 'flex', flex: 1, minWidth: 0, overflowX: 'auto' }}>
          {tabs.map((t) => {
            const isActive = currentActive?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
                style={{
                  flex: isMobile === true ? '0 0 auto' : 1,
                  padding: '8px 12px',
                  fontSize: 11,
                  border: 'none',
                  background: isActive ? '#ffffff' : 'transparent',
                  borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                  cursor: 'pointer',
                  fontWeight: isActive ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {isMobile === true && onClose !== undefined && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            style={{
              width: 36,
              background: 'transparent',
              border: 'none',
              borderLeft: '1px solid #e5e7eb',
              cursor: 'pointer',
              fontSize: 18,
              color: '#374151',
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>{currentActive?.render()}</div>
    </aside>
  );
};
