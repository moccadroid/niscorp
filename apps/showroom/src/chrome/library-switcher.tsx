import type { FC } from 'react';

export type Library = {
  id: string;
  name: string;
};

type Props = {
  libraries: Library[];
  activeId: string;
  onSelect: (id: string) => void;
  // Mobile-only: render a hamburger on the left that toggles the
  // sidebar drawer. Hidden on desktop where the sidebar is always
  // visible.
  onMenuClick?: () => void;
  // Mobile-only: render an inspector toggle on the right.
  onInspectorClick?: () => void;
};

const ICON_BTN_STYLE = {
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  width: 40,
  height: 36,
  flexShrink: 0,
  background: 'transparent',
  color: '#f9fafb',
  border: 'none',
  cursor: 'pointer' as const,
  fontSize: 18,
  lineHeight: 1,
};

export const LibrarySwitcher: FC<Props> = ({
  libraries,
  activeId,
  onSelect,
  onMenuClick,
  onInspectorClick,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        background: '#1f2937',
        color: '#f9fafb',
        borderBottom: '1px solid #374151',
        height: 36,
        flexShrink: 0,
      }}
    >
      {onMenuClick !== undefined && (
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Toggle navigation"
          style={{ ...ICON_BTN_STYLE, borderRight: '1px solid #374151' }}
        >
          ☰
        </button>
      )}

      <div
        style={{
          display: 'flex',
          flex: 1,
          minWidth: 0,
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
        {libraries.map((lib) => {
          const isActive = lib.id === activeId;
          return (
            <button
              key={lib.id}
              type="button"
              onClick={() => onSelect(lib.id)}
              style={{
                padding: '0 16px',
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                background: isActive ? '#374151' : 'transparent',
                color: isActive ? '#ffffff' : '#9ca3af',
                border: 'none',
                borderBottom: isActive ? '2px solid #60a5fa' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'background 100ms',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {lib.name}
            </button>
          );
        })}
      </div>

      {onInspectorClick !== undefined && (
        <button
          type="button"
          onClick={onInspectorClick}
          aria-label="Toggle inspector"
          style={{ ...ICON_BTN_STYLE, borderLeft: '1px solid #374151' }}
        >
          ⓘ
        </button>
      )}
    </div>
  );
};
