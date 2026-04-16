import { useState, type FC } from 'react';

// ═══════════════════════════════════════════════════════════
// JsonViewer — collapsible, syntax-highlighted JSON tree.
// Used to render structured assistant responses inside chat
// bubbles. Keeps depth ≤ 2 expanded by default so the user
// sees structure immediately without scrolling forever.
// ═══════════════════════════════════════════════════════════

const COLOR_KEY = '#9cdcfe';
const COLOR_STRING = '#ce9178';
const COLOR_NUMBER = '#b5cea8';
const COLOR_BOOL = '#569cd6';
const COLOR_NULL = '#808080';
const COLOR_PUNCT = '#d4d4d4';
const COLOR_TOGGLE = '#6b7280';

type Props = { value: unknown };

export const JsonViewer: FC<Props> = ({ value }) => (
  <div
    style={{
      padding: 12,
      background: '#1e1e1e',
      borderRadius: 6,
      fontSize: 12,
      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
      color: COLOR_PUNCT,
      lineHeight: 1.6,
      overflow: 'auto',
    }}
  >
    <Node value={value} depth={0} />
  </div>
);

const Node: FC<{ value: unknown; depth: number }> = ({ value, depth }) => {
  if (value === null) return <span style={{ color: COLOR_NULL }}>null</span>;
  if (typeof value === 'string') return <span style={{ color: COLOR_STRING }}>"{value}"</span>;
  if (typeof value === 'number') return <span style={{ color: COLOR_NUMBER }}>{String(value)}</span>;
  if (typeof value === 'boolean') return <span style={{ color: COLOR_BOOL }}>{String(value)}</span>;
  if (Array.isArray(value)) return <ArrayNode items={value} depth={depth} />;
  if (typeof value === 'object') return <ObjectNode entries={Object.entries(value as Record<string, unknown>)} depth={depth} />;
  return <span>{String(value)}</span>;
};

const ArrayNode: FC<{ items: unknown[]; depth: number }> = ({ items, depth }) => {
  const [open, setOpen] = useState<boolean>(depth < 2);
  if (items.length === 0) return <span>[]</span>;
  return (
    <span>
      <Toggle open={open} onClick={() => setOpen(!open)} />
      <span>[</span>
      {open ? (
        <div style={{ marginLeft: 16 }}>
          {items.map((item, i) => (
            <div key={i}>
              <Node value={item} depth={depth + 1} />
              {i < items.length - 1 && <span>,</span>}
            </div>
          ))}
        </div>
      ) : (
        <span style={{ color: COLOR_TOGGLE, fontStyle: 'italic' }}> {items.length} items </span>
      )}
      <span>]</span>
    </span>
  );
};

const ObjectNode: FC<{ entries: [string, unknown][]; depth: number }> = ({ entries, depth }) => {
  const [open, setOpen] = useState<boolean>(depth < 2);
  if (entries.length === 0) return <span>{'{}'}</span>;
  return (
    <span>
      <Toggle open={open} onClick={() => setOpen(!open)} />
      <span>{'{'}</span>
      {open ? (
        <div style={{ marginLeft: 16 }}>
          {entries.map(([k, v], i) => (
            <div key={k}>
              <span style={{ color: COLOR_KEY }}>"{k}"</span>
              <span>: </span>
              <Node value={v} depth={depth + 1} />
              {i < entries.length - 1 && <span>,</span>}
            </div>
          ))}
        </div>
      ) : (
        <span style={{ color: COLOR_TOGGLE, fontStyle: 'italic' }}> {entries.length} keys </span>
      )}
      <span>{'}'}</span>
    </span>
  );
};

const Toggle: FC<{ open: boolean; onClick: () => void }> = ({ open, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      background: 'none',
      border: 'none',
      color: COLOR_TOGGLE,
      cursor: 'pointer',
      padding: 0,
      marginRight: 4,
      fontFamily: 'inherit',
      fontSize: 'inherit',
    }}
  >
    {open ? '▼' : '▶'}
  </button>
);
