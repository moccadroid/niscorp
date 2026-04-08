import type { FC } from 'react';

export type Library = {
  id: string;
  name: string;
};

type Props = {
  libraries: Library[];
  activeId: string;
  onSelect: (id: string) => void;
};

export const LibrarySwitcher: FC<Props> = ({ libraries, activeId, onSelect }) => {
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
            }}
          >
            {lib.name}
          </button>
        );
      })}
    </div>
  );
};
