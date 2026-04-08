import type { FC } from 'react';
import { StatusDot, type DotColor } from './status-dot';

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
  statusMap: Record<string, DotColor>;
  kindOrder: string[];
  kindLabels: Record<string, string>;
  docs?: SidebarDoc[];
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

export const Sidebar: FC<Props> = ({
  title,
  stories,
  activeStoryId,
  onSelect,
  statusMap,
  kindOrder,
  kindLabels,
  docs,
}) => {
  const grouped = groupStories(stories);
  const hasDocs = docs !== undefined && docs.length > 0;
  return (
    <aside
      style={{
        width: 240,
        background: '#f3f4f6',
        overflow: 'auto',
        padding: '12px 0',
        fontSize: 13,
      }}
    >
      <div style={{ padding: '0 16px 12px', fontWeight: 700, color: '#111827' }}>
        {title}
      </div>

      {/* DOCS group — appears first when the active library has docs. */}
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
                <StatusDot color="gray" />
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
                {cats[cat]?.map((s) => {
                  const isActive = s.id === activeStoryId;
                  const color = statusMap[s.id] ?? 'gray';
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelect(s.id)}
                      style={ITEM_STYLE(isActive)}
                    >
                      <StatusDot color={color} />
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
