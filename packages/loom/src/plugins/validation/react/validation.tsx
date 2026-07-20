import type { CSSProperties } from 'react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

// The validation plugin's view component: a read-only JSON pane with a title. The
// plugin binds `value` to the editor's validation problems and registers this
// under VALIDATION.

const panel: CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' };
const head: CSSProperties = { padding: '6px 12px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 12, fontWeight: 600, color: '#374151' };
const pre: CSSProperties = { margin: 0, padding: 12, fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto' };

export const Validation: NovaComponent<{ title?: string; value?: unknown }> = ({ title, value }) => (
  <div style={panel}>
    {title !== undefined ? <div style={head}>{title}</div> : null}
    <pre style={pre}>{JSON.stringify(value ?? {}, null, 2)}</pre>
  </div>
);
