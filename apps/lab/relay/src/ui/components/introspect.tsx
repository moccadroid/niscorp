import { type FC, type ReactNode } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/adapters/react';
import { FS, LINE } from '../lib/tokens';

// Introspection primitives — Panel, JsonTree. The relay-styled (dark)
// implementations of the generic names nova/devtools composes against; nova's
// own light reference versions are for the zero-config DOM terminal. Same
// names, same props — the registry swap is the theming.

// ─── Panel ─────────────────────────────────────────────────
const PanelProps = z
  .object({
    title: z.string().optional(),
    backRef: z.string().optional().describe('When set, the header grows a ← (before the title) that fires ui:click with this ref.'),
    closeRef: z.string().optional().describe('When set, the header grows a ✕ that fires ui:click with this ref.'),
  })
  .strict();

export const Panel: NovaComponent<z.infer<typeof PanelProps>> = ({ title, backRef, closeRef, children }) => {
  const dispatch = useNovaDispatch();
  return (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      // the panel owns its viewport — intermediate wrappers (slotWrapper,
      // canvas hosts) don't propagate flex constraints, so cap here and let
      // the body scroll
      maxHeight: '80vh',
      minWidth: 320,
      maxWidth: 440,
      background: 'var(--surface)',
      border: LINE,
      borderRadius: 13,
      boxShadow: '0 12px 32px rgba(0, 0, 0, .45)',
      overflow: 'hidden',
    }}
  >
    {title !== undefined && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: LINE, fontWeight: 600, fontSize: FS['sm'], color: 'var(--text)' }}>
        {backRef !== undefined && (
          <button
            type="button"
            style={{ border: 'none', background: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: FS['sm'], lineHeight: 1, padding: 2 }}
            onClick={() => dispatch({ type: 'ui:click', ref: backRef })}
          >
            ←
          </button>
        )}
        <span style={{ flex: 1 }}>{title}</span>
        {closeRef !== undefined && (
          <button
            type="button"
            style={{ border: 'none', background: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: FS['sm'], lineHeight: 1, padding: 2 }}
            onClick={() => dispatch({ type: 'ui:click', ref: closeRef })}
          >
            ✕
          </button>
        )}
      </div>
    )}
    <div style={{ padding: 12, overflow: 'auto', minHeight: 0 }}>{children}</div>
  </div>
  );
};
Panel.meta = { description: 'A framed, elevated surface with an optional title header; `closeRef` adds a header ✕.', propsSchema: PanelProps };

// ─── JsonTree ──────────────────────────────────────────────
const entriesOf = (value: object): Array<[string, unknown]> =>
  Array.isArray(value) ? value.map((item, index): [string, unknown] => [String(index), item]) : Object.entries(value);

const JsonNode: FC<{ value: unknown; name?: string }> = ({ value, name }) => {
  if (value !== null && typeof value === 'object') {
    const entries = entriesOf(value);
    const shape = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
    return (
      <details>
        <summary style={{ cursor: 'pointer', color: 'var(--text-mute)' }}>{name === undefined ? shape : `${name} ${shape}`}</summary>
        <div style={{ paddingLeft: 13, borderLeft: LINE, marginLeft: 3 }}>
          {entries.map(([key, child]) => (
            <JsonNode key={key} value={child} name={key} />
          ))}
        </div>
      </details>
    );
  }
  const text = name === undefined ? JSON.stringify(value) : `${name}: ${JSON.stringify(value)}`;
  return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-2)' }}>{text}</div>;
};

const JsonTreeProps = z.object({ value: z.unknown().optional(), label: z.string().optional() }).strict();

export const JsonTree: NovaComponent<z.infer<typeof JsonTreeProps>> = ({
  value,
  label,
}: z.infer<typeof JsonTreeProps> & { children?: ReactNode }) => (
  <div style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: FS['xs'], lineHeight: 1.5 }}>
    <JsonNode value={value} name={label} />
  </div>
);
JsonTree.meta = { description: 'A collapsible view of any JSON value (native <details>, no state).', propsSchema: JsonTreeProps };
