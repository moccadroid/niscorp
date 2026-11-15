import type { CSSProperties } from 'react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { COLORS } from './tokens.js';

const panel: CSSProperties = { border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 8, overflow: 'hidden' };
const head: CSSProperties = { padding: '6px 12px', borderBottom: `1px solid ${COLORS.borderSubtle}`, background: COLORS.surfaceMuted, fontSize: 12, fontWeight: 600, color: COLORS.label };
const pre: CSSProperties = { margin: 0, padding: 12, fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto' };

export const JsonPane: NovaComponent<{ title?: string; value?: unknown }> = ({ title, value }) => (
  <div style={panel}>
    {title !== undefined ? <div style={head}>{title}</div> : null}
    <pre style={pre}>{JSON.stringify(value ?? {}, null, 2)}</pre>
  </div>
);
