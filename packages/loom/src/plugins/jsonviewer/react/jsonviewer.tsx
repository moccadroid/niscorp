import type { CSSProperties } from 'react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

// The jsonviewer's view component: a read-only JSON pane with a title. The plugin
// binds `value` to the editor's live documents and registers this under JSONVIEWER.

const panel: CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' };
const head: CSSProperties = { padding: '6px 12px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 12, fontWeight: 600, color: '#374151' };
const pre: CSSProperties = { margin: 0, padding: 12, fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto' };

export const JsonViewer: NovaComponent<{ title?: string; value?: unknown }> = ({ title, value }) => (
  <div style={panel}>
    {title !== undefined ? <div style={head}>{title}</div> : null}
    <pre style={pre}>{JSON.stringify(value ?? {}, null, 2)}</pre>
  </div>
);
