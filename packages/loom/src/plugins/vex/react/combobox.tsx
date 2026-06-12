import { useState, type CSSProperties, type FC } from 'react';
import { fieldStyle } from './styles.js';

const comboListStyle: CSSProperties = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 2, maxHeight: 200, overflowY: 'auto', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, boxShadow: '0 6px 16px rgba(0,0,0,0.12)' };
const comboItemStyle: CSSProperties = { padding: '6px 10px', fontSize: 13, cursor: 'pointer', fontFamily: 'ui-monospace, Menlo, monospace' };

// A combobox: shows all options on focus, filters as you type, commits a pick on
// mousedown (before the input blurs). Replaces <datalist>, which shows only the
// exact match once a value is set.
export const Combo: FC<{
  value: string;
  placeholder?: string;
  options: string[];
  onPick: (value: string) => void;
  style?: CSSProperties;
}> = ({ value, placeholder, options, onPick, style }) => {
  const [open, setOpen] = useState(false);
  const needle = value.toLowerCase();
  const matches = options.filter((option) => option.toLowerCase().includes(needle));
  return (
    <div style={{ position: 'relative', ...style }}>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onPick(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        style={{ ...fieldStyle, width: '100%' }}
      />
      {open && matches.length > 0 ? (
        <div style={comboListStyle}>
          {matches.slice(0, 50).map((option) => (
            <div
              key={option}
              // mousedown fires before the input's blur, so the pick lands.
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(option);
                setOpen(false);
              }}
              style={comboItemStyle}
            >
              {option}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
