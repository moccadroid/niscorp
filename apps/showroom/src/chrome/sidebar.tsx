import type { CSSProperties, FC } from 'react';

export type SidebarStory = {
  id: string;
  name: string;
  category: string;
  kind: string;
};

export type SidebarDoc = {
  id: string;
  title: string;
};

type Props = {
  title: string;
  stories: SidebarStory[];
  activeStoryId: string;
  onSelect: (id: string) => void;
  kindOrder: string[];
  kindLabels: Record<string, string>;
  docs?: SidebarDoc[];
  // When true, render as a fixed overlay drawer from the left with
  // a close button. Parent controls visibility via its own state +
  // backdrop; this component just renders as a drawer.
  isMobile?: boolean;
  onClose?: () => void;
};

type Grouped = Record<string, Record<string, SidebarStory[]>>;

const groupStories = (stories: SidebarStory[]): Grouped => {
  const out: Grouped = {};
  stories.forEach((s) => {
    const byKind = out[s.kind] ?? {};
    const list = byKind[s.category] ?? [];
    list.push(s);
    byKind[s.category] = list;
    out[s.kind] = byKind;
  });
  return out;
};

const KIND_HEADER_STYLE = {
  padding: '8px 16px 6px',
  marginTop: 4,
  fontSize: 12,
  textTransform: 'uppercase' as const,
  color: '#1f2937',
  fontWeight: 800,
  letterSpacing: 0.8,
  borderTop: '1px solid #d1d5db',
  background: '#e5e7eb',
};

const ITEM_STYLE = (isActive: boolean) => ({
  display: 'flex' as const,
  alignItems: 'center' as const,
  width: '100%',
  textAlign: 'left' as const,
  padding: '6px 24px',
  background: isActive ? '#2563eb' : 'transparent',
  color: isActive ? '#ffffff' : '#111827',
  border: 'none',
  cursor: 'pointer' as const,
  fontSize: 13,
});

const DESKTOP_STYLE: CSSProperties = {
  width: 240,
  flexShrink: 0,
  alignSelf: 'flex-start',
  position: 'sticky',
  top: 0,
  height: '100vh',
  background: '#f3f4f6',
  overflowY: 'auto',
  padding: '12px 0',
  fontSize: 13,
};

// On mobile, the sidebar is an overlay: fixed position, full height,
// slightly narrower than the viewport, z-index above the canvas.
// The backdrop is rendered by the parent.
const MOBILE_STYLE: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  bottom: 0,
  width: 'min(280px, 85vw)',
  background: '#f3f4f6',
  overflowY: 'auto',
  padding: '12px 0',
  fontSize: 13,
  zIndex: 50,
  boxShadow: '4px 0 12px rgba(0,0,0,0.15)',
};

export const Sidebar: FC<Props> = ({
  title,
  stories,
  activeStoryId,
  onSelect,
  kindOrder,
  kindLabels,
  docs,
  isMobile,
  onClose,
}) => {
  const grouped = groupStories(stories);
  const hasDocs = docs !== undefined && docs.length > 0;
  return (
    <aside style={isMobile === true ? MOBILE_STYLE : DESKTOP_STYLE}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px 12px',
        }}
      >
        <div style={{ fontWeight: 700, color: '#111827' }}>{title}</div>
        {isMobile === true && onClose !== undefined && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            style={{
              width: 28,
              height: 28,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              color: '#374151',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {hasDocs && (
        <div style={{ marginBottom: 16 }}>
          <div style={KIND_HEADER_STYLE}>Docs</div>
          {docs.map((doc) => {
            const isActive = doc.id === activeStoryId;
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => onSelect(doc.id)}
                style={ITEM_STYLE(isActive)}
              >
                <span>{doc.title}</span>
              </button>
            );
          })}
        </div>
      )}

      {kindOrder.map((kind) => {
        const cats = grouped[kind];
        if (cats === undefined) return null;
        const catNames = Object.keys(cats).sort();
        if (catNames.length === 0) return null;
        return (
          <div key={kind} style={{ marginBottom: 16 }}>
            <div style={KIND_HEADER_STYLE}>
              {kindLabels[kind] ?? kind}
            </div>
            {catNames.map((cat) => (
              <div key={cat} style={{ marginTop: 4 }}>
                {/* Skip a category header that just repeats the kind label
                    (a module with one category per kind is really 2-level). */}
                {cat !== (kindLabels[kind] ?? kind) && (
                  <div
                    style={{
                      padding: '6px 16px 2px',
                      fontSize: 11,
                      color: '#374151',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 0.4,
                    }}
                  >
                    {cat}
                  </div>
                )}
                {cats[cat]?.map((s) => {
                  const isActive = s.id === activeStoryId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelect(s.id)}
                      style={ITEM_STYLE(isActive)}
                    >
                      <span>{s.name}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </aside>
  );
};
