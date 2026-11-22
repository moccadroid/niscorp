import type { CSSProperties } from 'react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { useModelWrite } from '../hooks/model.js';
import { COLORS } from './tokens.js';

const groupStyle: CSSProperties = { display: 'flex', flexDirection: 'column' };
const titleStyle: CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 8, color: COLORS.text };
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: COLORS.label };
const hintStyle: CSSProperties = { fontSize: 12, color: COLORS.muted };
const removeStyle: CSSProperties = { marginLeft: 8, fontSize: 12, border: 'none', background: 'none', color: COLORS.accent, cursor: 'pointer', padding: 0 };

export const LoomGroup: NovaComponent<{ title?: string }> = ({ title, children }) => (
  <div style={groupStyle}>
    {title !== undefined ? <div style={titleStyle}>{title}</div> : null}
    {children}
  </div>
);

// An optional field is bound to its value: while it has one, Remove writes it
// back to absent. Its controls show either way, and typing into them adds it again.
export const LoomField: NovaComponent<{
  label?: string;
  description?: string;
  required?: boolean;
  optional?: boolean;
  error?: unknown;
  value?: unknown;
  // A <div>, not a <label>: a field can wrap a group or an array with its own
  // buttons, and a click anywhere in a <label> goes to the first control in it.
}> = ({ label, description, required, optional, error, value, novaModel, children }) => {
  const set = useModelWrite(novaModel);
  return (
    <div style={fieldStyle}>
      <span style={labelStyle}>
        {label}
        {required ? <span style={{ color: COLORS.danger }}> *</span> : null}
        {optional === true && value !== undefined ? (
          <button type="button" style={removeStyle} onClick={() => set(undefined)}>
            Remove
          </button>
        ) : null}
      </span>
      {description !== undefined ? <span style={hintStyle}>{description}</span> : null}
      {children}
      {typeof error === 'string' ? <span style={{ ...hintStyle, color: COLORS.danger }}>{error}</span> : null}
    </div>
  );
};
