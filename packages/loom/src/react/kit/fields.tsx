import type { CSSProperties } from 'react';
import type { NovaComponent } from '@niscorp/nova/react';

// The layout + field shells: the group heading and the per-field wrapper
// (label / description / required marker / error) around one control.

const groupStyle: CSSProperties = { display: 'flex', flexDirection: 'column' };
const titleStyle: CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#111827' };
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: '#374151' };
const hintStyle: CSSProperties = { fontSize: 12, color: '#6b7280' };

export const LoomGroup: NovaComponent<{ title?: string }> = ({ title, children }) => (
  <div style={groupStyle}>
    {title !== undefined ? <div style={titleStyle}>{title}</div> : null}
    {children}
  </div>
);

export const LoomField: NovaComponent<{
  label?: string;
  description?: string;
  required?: boolean;
  // Resolved from the error channel: a string at a leaf path, the error
  // sub-tree at a container path (rendered only when it's a string).
  error?: unknown;
  // A plain <div>, not a <label>: a field can wrap composite content (an
  // object group, an array with its own buttons), and a <label> would
  // capture every control inside it as its target.
}> = ({ label, description, required, error, children }) => (
  <div style={fieldStyle}>
    <span style={labelStyle}>
      {label}
      {required ? <span style={{ color: '#dc2626' }}> *</span> : null}
    </span>
    {description !== undefined ? <span style={hintStyle}>{description}</span> : null}
    {children}
    {typeof error === 'string' ? <span style={{ ...hintStyle, color: '#dc2626' }}>{error}</span> : null}
  </div>
);
